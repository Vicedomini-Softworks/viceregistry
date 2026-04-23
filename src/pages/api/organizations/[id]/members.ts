import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { organizationMembers, users } from "@/lib/schema"
import { eq, and } from "drizzle-orm"

export const GET: APIRoute = async ({ params, locals }) => {
  const userId = locals.user?.sub
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id: organizationId } = params
  if (!organizationId) return Response.json({ error: "Missing id" }, { status: 400 })

  // Check if user is a member of the org
  const [membership] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
    .limit(1)

  if (!membership) return Response.json({ error: "Forbidden" }, { status: 403 })

  const members = await db
    .select({
      userId: users.id,
      username: users.username,
      email: users.email,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(eq(organizationMembers.organizationId, organizationId))

  return Response.json(members)
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const userId = locals.user?.sub
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id: organizationId } = params
  if (!organizationId) return Response.json({ error: "Missing id" }, { status: 400 })

  // Check if user is owner/admin of the org
  const [membership] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
    .limit(1)

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { username, role } = body
  if (!username || !role) return Response.json({ error: "Username and role required" }, { status: 400 })

  const [targetUser] = await db.select().from(users).where(eq(users.username, username)).limit(1)
  if (!targetUser) return Response.json({ error: "User not found" }, { status: 404 })

  try {
    await db.insert(organizationMembers).values({
      organizationId,
      userId: targetUser.id,
      role,
    })
    return Response.json({ ok: true })
  } catch (err: any) {
    return Response.json({ error: "Failed to add member" }, { status: 500 })
  }
}

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const userId = locals.user?.sub
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { id: organizationId } = params
  const targetUserId = new URL(request.url).searchParams.get("userId")

  if (!organizationId || !targetUserId) return Response.json({ error: "Missing parameters" }, { status: 400 })

  // Check if user is owner/admin or removing themselves
  const [membership] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
    .limit(1)

  if (!membership) return Response.json({ error: "Forbidden" }, { status: 403 })

  const isSelf = userId === targetUserId
  const isAuthorized = ["owner", "admin"].includes(membership.role)

  if (!isSelf && !isAuthorized) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  await db
    .delete(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, targetUserId)))

  return Response.json({ ok: true })
}
