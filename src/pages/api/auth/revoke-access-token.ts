import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { accessTokens } from "@/lib/schema"
import { and, eq } from "drizzle-orm"

/** POST (not DELETE) so reverse proxies that block DELETE still work. */
export const POST: APIRoute = async ({ request, locals }) => {
  const userId = locals.user?.sub
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { tokenId?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const id = body.tokenId
  if (!id) return Response.json({ error: "Missing tokenId" }, { status: 400 })

  const result = await db
    .delete(accessTokens)
    .where(and(eq(accessTokens.id, id), eq(accessTokens.userId, userId)))
    .returning({ id: accessTokens.id })

  if (result.length === 0) {
    return Response.json({ error: "Token not found" }, { status: 404 })
  }

  return Response.json({ ok: true })
}
