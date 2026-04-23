import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { users, webauthnCredentials, userRoles, roles } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { verifyAuthenticationResponse } from "@simplewebauthn/server"
import { createSessionToken, setSessionCookie } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

const appUrl = process.env.PUBLIC_URL || (process.env.NODE_ENV === "production" ? "https://localhost" : "http://localhost:4321")
const url = new URL(appUrl)
const rpID = url.hostname
const origin = url.origin

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { username, response } = body
  if (!username || !response) return Response.json({ error: "Missing username or response" }, { status: 400 })

  const [user] = await db
    .select({ id: users.id, username: users.username, webauthnCurrentChallenge: users.webauthnCurrentChallenge })
    .from(users)
    .where(eq(users.username, username))
    .limit(1)

  if (!user || !user.webauthnCurrentChallenge) {
    return Response.json({ error: "No challenge found" }, { status: 400 })
  }

  const [credential] = await db
    .select()
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.id, response.id))
    .limit(1)

  if (!credential || credential.userId !== user.id) {
    return Response.json({ error: "Credential not found" }, { status: 400 })
  }

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: user.webauthnCurrentChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: Buffer.from(credential.id, "base64url"),
        credentialPublicKey: Buffer.from(credential.publicKey, "base64url"),
        counter: credential.counter,
        transports: credential.transports ? (credential.transports.split(",") as any) : undefined,
      },
    })
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 400 })
  }

  if (verification.verified && verification.authenticationInfo) {
    await db
      .update(webauthnCredentials)
      .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
      .where(eq(webauthnCredentials.id, credential.id))

    await db.update(users).set({ webauthnCurrentChallenge: null }).where(eq(users.id, user.id))

    const userRolesRows = await db
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, user.id))

    const token = await createSessionToken({
      sub: user.id,
      username: user.username,
      roles: userRolesRows.map((r) => r.name),
    })

    setSessionCookie(cookies, token)
    writeAuditLog({ userId: user.id, action: "login_webauthn", resource: null, ipAddress: null })

    return Response.json({ ok: true })
  }

  return Response.json({ error: "Verification failed" }, { status: 400 })
}
