import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { users } from "@/lib/schema"
import { updateSettingsSchema } from "@/lib/validations"
import { writeAuditLog } from "@/lib/audit"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"

export const PUT: APIRoute = async ({ request, locals }) => {
  const userId = locals.user?.sub
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = updateSettingsSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues }, { status: 400 })
  }

  const { email, currentPassword, newPassword } = parsed.data

  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) return Response.json({ error: "User not found" }, { status: 404 })

  const updates: Record<string, unknown> = { updatedAt: new Date() }

  if (email !== undefined) updates.email = email

  if (newPassword && currentPassword) {
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!isValid) {
      return Response.json({ error: "Invalid current password" }, { status: 400 })
    }
    updates.passwordHash = await bcrypt.hash(newPassword, 12)
  }

  if (Object.keys(updates).length > 1) {
    await db.update(users).set(updates).where(eq(users.id, userId))
    writeAuditLog({ userId, action: "update_settings", resource: userId, ipAddress: null })
  }

  return Response.json({ ok: true })
}
