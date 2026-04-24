import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { webauthnCredentials } from "@/lib/schema"
import { writeAuditLog } from "@/lib/audit"
import { and, eq } from "drizzle-orm"

export const DELETE: APIRoute = async ({ params, locals }) => {
  const userId = locals.user?.sub
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = params
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const result = await db
    .delete(webauthnCredentials)
    .where(and(eq(webauthnCredentials.id, id), eq(webauthnCredentials.userId, userId)))
    .returning({ id: webauthnCredentials.id })

  if (result.length === 0) {
    return Response.json({ error: "Passkey not found" }, { status: 404 })
  }

  writeAuditLog({ userId, action: "delete_webauthn", resource: id, ipAddress: null })

  return Response.json({ ok: true })
}
