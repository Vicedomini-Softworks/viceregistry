import { db } from "./db"
import { repositories, imageMetadata } from "./schema"
import { listRepositories, listTags, getManifest } from "./registry-client"
import { eq, sql } from "drizzle-orm"

const STALE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

function isStale(date: Date | null | undefined): boolean {
  if (!date) return true
  return Date.now() - date.getTime() > STALE_THRESHOLD_MS
}

/** Sync repository list from registry → PG. Fast: one registry API call. */
export async function syncRepositories(): Promise<void> {
  const names = await listRepositories()
  if (names.length === 0) return

  await db
    .insert(repositories)
    .values(names.map((name) => ({ name, lastSyncedAt: new Date() })))
    .onConflictDoUpdate({
      target: repositories.name,
      set: { lastSyncedAt: new Date() },
    })
}

/**
 * Sync tags + manifests for a single repository → PG.
 * Only syncs if the repo entry is stale or missing.
 */
export async function syncRepository(name: string): Promise<void> {
  const [existing] = await db
    .select({ lastSyncedAt: repositories.lastSyncedAt })
    .from(repositories)
    .where(eq(repositories.name, name))
    .limit(1)

  if (!isStale(existing?.lastSyncedAt)) return

  const tags = await listTags(name)

  // Fetch manifests in parallel (max 8 concurrent)
  const chunk = (arr: string[], size: number) =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
      arr.slice(i * size, i * size + size),
    )

  let totalSize = 0
  const metaRows: (typeof imageMetadata.$inferInsert)[] = []

  for (const batch of chunk(tags, 8)) {
    const results = await Promise.allSettled(
      batch.map(async (tag) => {
        const res = await getManifest(name, tag)
        if (!res.ok) return null
        const manifest: Record<string, unknown> = await res.json()
        return { tag, manifest }
      }),
    )

    for (const result of results) {
      if (result.status === "rejected") continue
      if (!result.value) continue
      const { tag, manifest } = result.value

      const layers = (
        (manifest.layers ?? manifest.fsLayers ?? []) as Array<Record<string, unknown>>
      ).map((l) => Number(l.size ?? 0))
      const size = layers.reduce((a, b) => a + b, 0)
      totalSize += size

      const config = manifest.config as Record<string, unknown> | undefined
      const configData = config as { os?: string; architecture?: string; created?: string } | undefined

      metaRows.push({
        repository: name,
        tag,
        digest: (manifest.config as Record<string, unknown> | undefined)?.digest as string | undefined,
        totalSize: size,
        os: configData?.os ?? null,
        architecture: configData?.architecture ?? null,
        createdAt: configData?.created ? new Date(configData.created) : null,
        lastSyncedAt: new Date(),
      })
    }
  }

  // Upsert all metadata rows
  if (metaRows.length > 0) {
    await db
      .insert(imageMetadata)
      .values(metaRows)
      .onConflictDoUpdate({
        target: [imageMetadata.repository, imageMetadata.tag],
        set: {
          digest: sql`excluded.digest`,
          totalSize: sql`excluded.total_size`,
          os: sql`excluded.os`,
          architecture: sql`excluded.architecture`,
          createdAt: sql`excluded.created_at`,
          lastSyncedAt: sql`excluded.last_synced_at`,
        },
      })
  }

  // Upsert repository row with fresh tag count + size
  await db
    .insert(repositories)
    .values({ name, tagCount: tags.length, sizeBytes: totalSize, lastSyncedAt: new Date() })
    .onConflictDoUpdate({
      target: repositories.name,
      set: { tagCount: tags.length, sizeBytes: totalSize, lastSyncedAt: new Date() },
    })
}

/** Full sync: all repos + their tags. Can be slow for large registries. */
export async function syncAll(): Promise<void> {
  const names = await listRepositories()
  await Promise.allSettled(names.map((name) => syncRepository(name)))
}
