import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { users } from "@/lib/schema"
import { writeAuditLog } from "@/lib/audit"
import { verifyTotpCode } from "@/lib/totp"
import { eq } from "drizzle-orm"
import { z } from "zod"

const schema = z.object({
  code: z.string().regex(/^\d{6}$/),
})

export const POST: APIRoute = async ({ request, locals }) => {
  const userId = locals.user?.sub
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) return Response.json({ error: "Invalid code format" }, { status: 400 })

  const [user] = await db
    .select({ totpSecret: users.totpSecret, totpEnabled: users.totpEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) return Response.json({ error: "User not found" }, { status: 404 })
  if (!user.totpEnabled || !user.totpSecret) {
    return Response.json({ error: "2FA is not enabled" }, { status: 400 })
  }

  if (!(await verifyTotpCode(user.totpSecret, parsed.data.code))) {
    return Response.json({ error: "Invalid 2FA code" }, { status: 400 })
  }

  await db
    .update(users)
    .set({
      totpSecret: null,
      totpPendingSecret: null,
      totpEnabled: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))

  writeAuditLog({ userId, action: "totp_disabled", resource: userId, ipAddress: null })

  return Response.json({ ok: true })
}
