import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { users, userRoles, roles } from "@/lib/schema"
import { createUserSchema } from "@/lib/validations"
import { writeAuditLog } from "@/lib/audit"
import { eq, inArray } from "drizzle-orm"
import bcrypt from "bcryptjs"

export const GET: APIRoute = async () => {
  const allUsers = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.createdAt)

  const userIds = allUsers.map((u) => u.id)
  const roleAssignments =
    userIds.length > 0
      ? await db
          .select({ userId: userRoles.userId, roleName: roles.name })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(inArray(userRoles.userId, userIds))
      : []

  const rolesByUser = roleAssignments.reduce(
    (acc, r) => {
      if (!acc[r.userId]) acc[r.userId] = []
      acc[r.userId].push(r.roleName)
      return acc
    },
    {} as Record<string, string[]>,
  )

  return Response.json(allUsers.map((u) => ({ ...u, roles: rolesByUser[u.id] ?? [] })))
}

export const POST: APIRoute = async ({ request, locals }) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = createUserSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues }, { status: 400 })
  }
  const { username, email, password, roles: roleNames } = parsed.data

  const hash = await bcrypt.hash(password, 12)

  const [newUser] = await db
    .insert(users)
    .values({ username, email, passwordHash: hash })
    .returning()
    .catch(() => {
      throw new Error("Username or email already exists")
    })

  const roleRows = await db
    .select({ id: roles.id, name: roles.name })
    .from(roles)
    .where(inArray(roles.name, roleNames))

  if (roleRows.length > 0) {
    await db
      .insert(userRoles)
      .values(roleRows.map((r) => ({ userId: newUser.id, roleId: r.id })))
      .onConflictDoNothing()
  }

  writeAuditLog({
    userId: locals.user!.sub,
    action: "create_user",
    resource: newUser.id,
    ipAddress: null,
  })

  return Response.json({ id: newUser.id, username: newUser.username, email: newUser.email, roles: roleNames }, { status: 201 })
}
