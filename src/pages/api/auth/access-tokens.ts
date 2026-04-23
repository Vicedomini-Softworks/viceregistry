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
    .select({
      id: accessTokens.id,
      name: accessTokens.name,
      prefix: accessTokens.prefix,
      tokenPreview: accessTokens.tokenPreview,
      expiresAt: accessTokens.expiresAt,
      lastUsedAt: accessTokens.lastUsedAt,
      createdAt: accessTokens.createdAt,
    })
    .from(accessTokens)
    .where(eq(accessTokens.userId, userId))
    .orderBy(accessTokens.createdAt)

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

  const { name, organizationId, repositoryName } = body
  if (!name) return Response.json({ error: "Name required" }, { status: 400 })

  const prefix = "vr_"
  const randomPart = crypto.randomBytes(32).toString("hex")
  const rawToken = prefix + randomPart
  const tokenHash = await bcrypt.hash(rawToken, 12)

  const tokenPreview = `${rawToken.slice(0, 3)}...${rawToken.slice(-3)}`

  const expiresAt = new Date()
  expiresAt.setFullYear(expiresAt.getFullYear() + 1)

  await db.insert(accessTokens).values({
    userId,
    name,
    tokenHash,
    prefix,
    tokenPreview,
    organizationId: organizationId || null,
    repositoryName: repositoryName || null,
    expiresAt,
  })

  return Response.json({ token: rawToken })
}
