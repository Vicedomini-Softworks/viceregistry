import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { webauthnCredentials } from "@/lib/schema"
import { writeAuditLog } from "@/lib/audit"
import { and, eq } from "drizzle-orm"

/** POST (not DELETE) so reverse proxies that block DELETE, and WAFs that flag "/credentials" paths, still work. */
export const POST: APIRoute = async ({ request, locals }) => {
  const userId = locals.user?.sub
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: { credentialId?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const id = body.credentialId
  if (!id) return Response.json({ error: "Missing credentialId" }, { status: 400 })

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
