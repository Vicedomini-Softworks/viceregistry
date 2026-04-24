import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { repositories, userRepositoryPermissions } from "@/lib/schema"
import { eq, and } from "drizzle-orm"

const MAX_LEN = 256_000

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

  const raw =
    typeof body === "object" && body !== null && "overviewMarkdown" in body
      ? (body as { overviewMarkdown: unknown }).overviewMarkdown
      : null

  if (raw === null) {
    await db.update(repositories).set({ overviewMarkdown: null }).where(eq(repositories.name, repositoryName))
    return Response.json({ ok: true, overviewMarkdown: null })
  }

  if (typeof raw !== "string") {
    return Response.json({ error: "overviewMarkdown must be a string or null" }, { status: 400 })
  }

  if (raw.trim() === "") {
    await db.update(repositories).set({ overviewMarkdown: null }).where(eq(repositories.name, repositoryName))
    return Response.json({ ok: true, overviewMarkdown: null })
  }

  if (raw.length > MAX_LEN) {
    return Response.json({ error: `Overview must be at most ${MAX_LEN} characters` }, { status: 400 })
  }

  const result = await db
    .update(repositories)
    .set({ overviewMarkdown: raw })
    .where(eq(repositories.name, repositoryName))
    .returning({ name: repositories.name })

  if (result.length === 0) return Response.json({ error: "Repository not found" }, { status: 404 })

  return Response.json({ ok: true, overviewMarkdown: raw })
}
