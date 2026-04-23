import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { organizations, organizationMembers } from "@/lib/schema"
import { createOrganizationSchema, deriveSlug } from "@/lib/validations"
import { eq } from "drizzle-orm"

export const GET: APIRoute = async ({ locals }) => {
  const userId = locals.user?.sub
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const orgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const result = createOrganizationSchema.safeParse(body)
  if (!result.success) {
    return Response.json({ error: result.error.issues[0].message }, { status: 400 })
  }

  const { name, description } = result.data
  const slug = result.data.slug ?? deriveSlug(name)

  try {
    const [newOrg] = await db
      .insert(organizations)
      .values({ name, slug, description })
      .returning()

    await db.insert(organizationMembers).values({
      organizationId: newOrg.id,
      userId,
      role: "owner",
    })

    return Response.json(newOrg)
  } catch (err: any) {
    if (err.code === "23505") {
      const isSlug = err.detail?.includes("slug")
      return Response.json(
        { error: isSlug ? "Slug already taken" : "Organization name already exists" },
        { status: 400 },
      )
    }
    return Response.json({ error: "Failed to create organization" }, { status: 500 })
  }
}
