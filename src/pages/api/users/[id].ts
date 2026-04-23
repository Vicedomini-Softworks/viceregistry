import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { users, userRoles, roles } from "@/lib/schema"
import { updateUserSchema } from "@/lib/validations"
import { writeAuditLog } from "@/lib/audit"
import { eq, inArray } from "drizzle-orm"
import bcrypt from "bcryptjs"

export const GET: APIRoute = async ({ params }) => {
  const { id } = params
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  const [user] = await db
    .select({ id: users.id, username: users.username, email: users.email, isActive: users.isActive, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)

  if (!user) return Response.json({ error: "Not found" }, { status: 404 })

  const roleRows = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, id))

  return Response.json({ ...user, roles: roleRows.map((r) => r.name) })
}

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const { id } = params
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = updateUserSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues }, { status: 400 })
  }
  const { email, password, isActive, roles: roleNames } = parsed.data

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (email !== undefined) updates.email = email
  if (isActive !== undefined) updates.isActive = isActive
  if (password !== undefined) updates.passwordHash = await bcrypt.hash(password, 12)

  await db.update(users).set(updates).where(eq(users.id, id))

  if (roleNames !== undefined) {
    await db.delete(userRoles).where(eq(userRoles.userId, id))
    if (roleNames.length > 0) {
      const roleRows = await db
        .select({ id: roles.id })
        .from(roles)
        .where(inArray(roles.name, roleNames))
      if (roleRows.length > 0) {
        await db
          .insert(userRoles)
          .values(roleRows.map((r) => ({ userId: id, roleId: r.id })))
          .onConflictDoNothing()
      }
    }
  }

  writeAuditLog({ userId: locals.user!.sub, action: "update_user", resource: id, ipAddress: null })

  return Response.json({ ok: true })
}

export const DELETE: APIRoute = async ({ params, locals }) => {
  const { id } = params
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 })

  if (id === locals.user!.sub) {
    return Response.json({ error: "Cannot delete your own account" }, { status: 400 })
  }

  await db.delete(users).where(eq(users.id, id))

  writeAuditLog({ userId: locals.user!.sub, action: "delete_user", resource: id, ipAddress: null })

  return Response.json({ ok: true })
}
