import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { users } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { generateAuthenticationOptions } from "@simplewebauthn/server"

const rpID = process.env.HOST === "0.0.0.0" ? "localhost" : (process.env.HOST || "localhost")

export const POST: APIRoute = async ({ request }) => {
  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { username } = body
  if (!username) return Response.json({ error: "Username required" }, { status: 400 })

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1)
  if (!user) return Response.json({ error: "User not found" }, { status: 404 })

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  })

  await db.update(users).set({ webauthnCurrentChallenge: options.challenge }).where(eq(users.id, user.id))

  return Response.json(options)
}
