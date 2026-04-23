import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { users, webauthnCredentials } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { verifyRegistrationResponse } from "@simplewebauthn/server"
import { writeAuditLog } from "@/lib/audit"

const rpID = process.env.HOST === "0.0.0.0" ? "localhost" : (process.env.HOST || "localhost")
const origin = process.env.NODE_ENV === "production" ? `https://${rpID}` : `http://${rpID}:4321`

export const POST: APIRoute = async ({ request, locals }) => {
  const userId = locals.user?.sub
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const [user] = await db
    .select({ webauthnCurrentChallenge: users.webauthnCurrentChallenge })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user || !user.webauthnCurrentChallenge) {
    return Response.json({ error: "No challenge found" }, { status: 400 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: user.webauthnCurrentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    })
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 400 })
  }

  if (verification.verified && verification.registrationInfo) {
    const { credentialID, credentialPublicKey, counter, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

    await db.insert(webauthnCredentials).values({
      id: Buffer.from(credentialID).toString("base64url"),
      userId,
      publicKey: Buffer.from(credentialPublicKey).toString("base64url"),
      counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: body.response.transports?.join(",") || "",
    })

    await db.update(users).set({ webauthnCurrentChallenge: null }).where(eq(users.id, userId))
    writeAuditLog({ userId, action: "register_webauthn", resource: userId, ipAddress: null })

    return Response.json({ ok: true })
  }

  return Response.json({ error: "Verification failed" }, { status: 400 })
}
