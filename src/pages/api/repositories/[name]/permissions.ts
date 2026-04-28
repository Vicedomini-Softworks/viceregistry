import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { userRepositoryPermissions, users, repositories } from "@/lib/schema"
import { eq, and } from "drizzle-orm"
import { writeAuditLog } from "@/lib/audit"

function getClientIp(request: Request): string | null {
  return (
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    request.headers.get("X-Real-IP") ??
    null
  )
}

export const GET: APIRoute = async ({ params, locals }) => {
  const userId = locals.user?.sub
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { name: repositoryName } = params
  if (!repositoryName) return Response.json({ error: "Missing repository name" }, { status: 400 })

  // Check if user has admin access to the repo (global admin or direct admin)
  const isAdmin = locals.user?.roles.includes("admin")
  
  const [directAdmin] = await db
    .select()
    .from(userRepositoryPermissions)
    .where(
      and(
        eq(userRepositoryPermissions.repositoryName, repositoryName),
        eq(userRepositoryPermissions.userId, userId),
        eq(userRepositoryPermissions.permission, "admin")
      )
    )
    .limit(1)

  if (!isAdmin && !directAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  const permissions = await db
    .select({
      userId: users.id,
      username: users.username,
      permission: userRepositoryPermissions.permission,
    })
    .from(userRepositoryPermissions)
    .innerJoin(users, eq(userRepositoryPermissions.userId, users.id))
    .where(eq(userRepositoryPermissions.repositoryName, repositoryName))

  return Response.json(permissions)
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const userId = locals.user?.sub
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { name: repositoryName } = params
  if (!repositoryName) return Response.json({ error: "Missing repository name" }, { status: 400 })

  // Authorization check (simplified: global admin or direct admin)
  const isAdmin = locals.user?.roles.includes("admin")
  const [directAdmin] = await db
    .select()
    .from(userRepositoryPermissions)
    .where(
      and(
        eq(userRepositoryPermissions.repositoryName, repositoryName),
        eq(userRepositoryPermissions.userId, userId),
        eq(userRepositoryPermissions.permission, "admin")
      )
    )
    .limit(1)

  if (!isAdmin && !directAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { username, permission } = body
  if (!username || !permission) return Response.json({ error: "Username and permission required" }, { status: 400 })

  const [targetUser] = await db.select().from(users).where(eq(users.username, username)).limit(1)
  if (!targetUser) return Response.json({ error: "User not found" }, { status: 404 })

  try {
    await db
      .insert(userRepositoryPermissions)
      .values({
        userId: targetUser.id,
        repositoryName,
        permission,
      })
      .onConflictDoUpdate({
        target: [userRepositoryPermissions.userId, userRepositoryPermissions.repositoryName],
        set: { permission },
      })
    return Response.json({ ok: true })
  } catch (err: any) {
    return Response.json({ error: "Failed to set permission" }, { status: 500 })
  }
}

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const userId = locals.user?.sub
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { name: repositoryName } = params
  const targetUserId = new URL(request.url).searchParams.get("userId")

  if (!repositoryName || !targetUserId) return Response.json({ error: "Missing parameters" }, { status: 400 })

  // Authorization check
  const isAdmin = locals.user?.roles.includes("admin")
  const [directAdmin] = await db
    .select()
    .from(userRepositoryPermissions)
    .where(
      and(
        eq(userRepositoryPermissions.repositoryName, repositoryName),
        eq(userRepositoryPermissions.userId, userId),
        eq(userRepositoryPermissions.permission, "admin")
      )
    )
    .limit(1)

  if (!isAdmin && !directAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  await db
    .delete(userRepositoryPermissions)
    .where(and(eq(userRepositoryPermissions.repositoryName, repositoryName), eq(userRepositoryPermissions.userId, targetUserId)))

  writeAuditLog({
    userId,
    action: "remove_permission",
    resource: `${repositoryName}:${targetUserId}`,
    ipAddress: getClientIp(request),
  })

  return Response.json({ ok: true })
}
