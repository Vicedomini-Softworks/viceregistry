import { db } from "./db"
import { imageMetadata, userRepositoryPermissions, users, repositories } from "./schema"
import { buildRepositoryOverview } from "./repository-overview"
import { eq, asc, and } from "drizzle-orm"

export type PermissionRow = {
  userId: string
  username: string
  permission: string
}

export type TagRowData = {
  tag: string
  digest: string | null
  totalSize: number | null
  os: string | null
  architecture: string | null
}

type HubUser = { sub: string; roles: string[] }

export async function loadRepositoryHubData(repositoryName: string, user: HubUser | undefined) {
  const tagRows = await db
    .select({
      tag: imageMetadata.tag,
      digest: imageMetadata.digest,
      totalSize: imageMetadata.totalSize,
      os: imageMetadata.os,
      architecture: imageMetadata.architecture,
      labels: imageMetadata.labels,
      lastSyncedAt: imageMetadata.lastSyncedAt,
    })
    .from(imageMetadata)
    .where(eq(imageMetadata.repository, repositoryName))
    .orderBy(asc(imageMetadata.tag))

  const [repoRow] = await db
    .select({
      visibility: repositories.visibility,
      overviewMarkdown: repositories.overviewMarkdown,
    })
    .from(repositories)
    .where(eq(repositories.name, repositoryName))
    .limit(1)

  const overview = buildRepositoryOverview({
    overviewMarkdown: repoRow?.overviewMarkdown,
    tagRows: tagRows.map((r) => ({
      tag: r.tag,
      lastSyncedAt: r.lastSyncedAt,
      labels: r.labels,
    })),
  })

  const isGlobalAdmin = user?.roles.includes("admin") ?? false

  const [directAdmin] = user
    ? await db
        .select()
        .from(userRepositoryPermissions)
        .where(
          and(
            eq(userRepositoryPermissions.repositoryName, repositoryName),
            eq(userRepositoryPermissions.userId, user.sub),
            eq(userRepositoryPermissions.permission, "admin"),
          ),
        )
        .limit(1)
    : []

  const canManagePermissions = isGlobalAdmin || !!directAdmin

  const permissions: PermissionRow[] = canManagePermissions
    ? await db
        .select({
          userId: users.id,
          username: users.username,
          permission: userRepositoryPermissions.permission,
        })
        .from(userRepositoryPermissions)
        .innerJoin(users, eq(userRepositoryPermissions.userId, users.id))
        .where(eq(userRepositoryPermissions.repositoryName, repositoryName))
    : []

  return {
    tagRows,
    repoVisibility: repoRow?.visibility ?? "public",
    overviewMarkdown: repoRow?.overviewMarkdown ?? null,
    overview,
    isGlobalAdmin,
    canManagePermissions,
    permissions,
  }
}
