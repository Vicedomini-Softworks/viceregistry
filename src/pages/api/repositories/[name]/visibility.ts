import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { repositories, userRepositoryPermissions } from "@/lib/schema"
import { eq, and } from "drizzle-orm"

const VIS = new Set(["public", "private"])

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const userId = locals.user?.sub
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const { name: repositoryName } = params
  if (!repositoryName) return Response.json({ error: "Missing repository name" }, { status: 400 })

  const isGlobalAdmin = locals.user?.roles.includes("admin")
  const [directAdmin] = await db
    .select()
    .from(userRepositoryPermissions)
    .where(
      and(
        eq(userRepositoryPermissions.repositoryName, repositoryName),
        eq(userRepositoryPermissions.userId, userId),
        eq(userRepositoryPermissions.permission, "admin"),
      ),
    )
    .limit(1)

  if (!isGlobalAdmin && !directAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const vis = typeof body === "object" && body !== null && "visibility" in body ? (body as { visibility: unknown }).visibility : null
  if (typeof vis !== "string" || !VIS.has(vis)) {
    return Response.json({ error: "visibility must be public or private" }, { status: 400 })
  }

  const result = await db
    .update(repositories)
    .set({ visibility: vis })
    .where(eq(repositories.name, repositoryName))
    .returning({ name: repositories.name })

  if (result.length === 0) return Response.json({ error: "Repository not found" }, { status: 404 })

  return Response.json({ ok: true, visibility: vis })
}
