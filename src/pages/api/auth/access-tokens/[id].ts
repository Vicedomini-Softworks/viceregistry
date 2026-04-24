import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { accessTokens } from "@/lib/schema"
import { eq, and } from "drizzle-orm"

export const DELETE: APIRoute = async ({ params, locals }) => {
  const userId = locals.user?.sub
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = params
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const result = await db
    .delete(accessTokens)
    .where(and(eq(accessTokens.id, id), eq(accessTokens.userId, userId)))
    .returning({ id: accessTokens.id })

  if (result.length === 0) {
    return Response.json({ error: "Token not found" }, { status: 404 })
  }

  return Response.json({ ok: true })
}
