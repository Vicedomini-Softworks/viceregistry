import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { repositories, imageMetadata } from "@/lib/schema"
import {
  filterByRepositoryAccess,
  filterImageRowsByAccess,
  type BrowseUser,
} from "@/lib/repository-access"
import { ilike, or } from "drizzle-orm"

export const GET: APIRoute = async ({ url, locals }) => {
  const u = locals.user
  const browseUser: BrowseUser = u ? { sub: u.sub, roles: u.roles } : null

  const q = url.searchParams.get("q")?.trim() ?? ""

  if (!q) {
    const allRepos = await db
      .select({ name: repositories.name, tagCount: repositories.tagCount, sizeBytes: repositories.sizeBytes })
      .from(repositories)
      .orderBy(repositories.name)
      .limit(200)
    return Response.json({ repositories: await filterByRepositoryAccess(allRepos, browseUser), images: [] })
  }

  const pattern = `%${q}%`

  const [matchedRepos, matchedImages] = await Promise.all([
    db
      .select({ name: repositories.name, tagCount: repositories.tagCount, sizeBytes: repositories.sizeBytes })
      .from(repositories)
      .where(ilike(repositories.name, pattern))
      .orderBy(repositories.name)
      .limit(50),

    db
      .select({
        repository: imageMetadata.repository,
        tag: imageMetadata.tag,
        digest: imageMetadata.digest,
        totalSize: imageMetadata.totalSize,
        os: imageMetadata.os,
        architecture: imageMetadata.architecture,
      })
      .from(imageMetadata)
      .where(
        or(
          ilike(imageMetadata.repository, pattern),
          ilike(imageMetadata.tag, pattern),
        ),
      )
      .orderBy(imageMetadata.repository, imageMetadata.tag)
      .limit(100),
  ])

  return Response.json({
    repositories: await filterByRepositoryAccess(matchedRepos, browseUser),
    images: await filterImageRowsByAccess(matchedImages, browseUser),
  })
}
