import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { users, webauthnCredentials } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { verifyRegistrationResponse } from "@simplewebauthn/server"
import { writeAuditLog } from "@/lib/audit"

const appUrl = process.env.PUBLIC_URL || (process.env.NODE_ENV === "production" ? "https://localhost" : "http://localhost:4321")
const url = new URL(appUrl)
const rpID = url.hostname
const origin = url.origin

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
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

    await db.insert(webauthnCredentials).values({
      id: credential.id,
      userId,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.transports?.join(",") || "",
    })

    await db.update(users).set({ webauthnCurrentChallenge: null }).where(eq(users.id, userId))
    writeAuditLog({ userId, action: "register_webauthn", resource: userId, ipAddress: null })

    return Response.json({ ok: true })
  }

  return Response.json({ error: "Verification failed" }, { status: 400 })
}
