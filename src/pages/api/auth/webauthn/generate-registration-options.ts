import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { users } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { generateRegistrationOptions } from "@simplewebauthn/server"

const rpName = "ViceRegistry"
const appUrl = process.env.PUBLIC_URL || (process.env.NODE_ENV === "production" ? "https://localhost" : "http://localhost:4321")
const url = new URL(appUrl)
const rpID = url.hostname

export const GET: APIRoute = async ({ locals }) => {
  const userId = locals.user?.sub
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const [user] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return Response.json({ error: "User not found" }, { status: 404 })

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(userId),
    userName: user.username,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  })

  await db.update(users).set({ webauthnCurrentChallenge: options.challenge }).where(eq(users.id, userId))

  return Response.json(options)
}
