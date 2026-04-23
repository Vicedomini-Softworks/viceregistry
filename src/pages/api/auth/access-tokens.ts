import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { accessTokens } from "@/lib/schema"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"
import crypto from "crypto"

export const GET: APIRoute = async ({ locals }) => {
  const userId = locals.user?.sub
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const tokens = await db
    .select({ id: accessTokens.id, name: accessTokens.name, prefix: accessTokens.prefix, lastUsedAt: accessTokens.lastUsedAt, createdAt: accessTokens.createdAt })
    .from(accessTokens)
    .where(eq(accessTokens.userId, userId))

  return Response.json(tokens)
}

export const POST: APIRoute = async ({ request, locals }) => {
  const userId = locals.user?.sub
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.name) return Response.json({ error: "Name required" }, { status: 400 })

  const rawToken = "vr_" + crypto.randomBytes(32).toString("hex")
  const tokenHash = await bcrypt.hash(rawToken, 12)

  await db.insert(accessTokens).values({
    userId,
    name: body.name,
    tokenHash,
    prefix: "vr_",
  })

  return Response.json({ token: rawToken })
}
