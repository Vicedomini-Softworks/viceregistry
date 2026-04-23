import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { organizations, organizationMembers } from "@/lib/schema"
import { eq } from "drizzle-orm"

export const GET: APIRoute = async ({ locals }) => {
  const userId = locals.user?.sub
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  // List organizations where the user is a member
  const orgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      description: organizations.description,
      role: organizationMembers.role,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .innerJoin(organizationMembers, eq(organizations.id, organizationMembers.organizationId))
    .where(eq(organizationMembers.userId, userId))

  return Response.json(orgs)
}

export const POST: APIRoute = async ({ request, locals }) => {
  const userId = locals.user?.sub
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!body.name) return Response.json({ error: "Name required" }, { status: 400 })

  try {
    const [newOrg] = await db
      .insert(organizations)
      .values({
        name: body.name,
        description: body.description,
      })
      .returning()

    await db.insert(organizationMembers).values({
      organizationId: newOrg.id,
      userId,
      role: "owner",
    })

    return Response.json(newOrg)
  } catch (err: any) {
    if (err.code === "23505") {
      return Response.json({ error: "Organization name already exists" }, { status: 400 })
    }
    return Response.json({ error: "Failed to create organization" }, { status: 500 })
  }
}
