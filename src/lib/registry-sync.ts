import { db } from "./db"
import { repositories, imageMetadata } from "./schema"
import { listRepositories, listTags, getManifest, getJsonBlob } from "./registry-client"
import { parseConfigBlob, resolveToImageManifest } from "./registry-manifest"
import { and, eq, notInArray, sql } from "drizzle-orm"

const STALE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

/** First segment of Content-Type (strips parameters such as charset). */
export function contentTypeMediaTypeFromGet(get: (name: string) => string | null): string {
  const raw = get("content-type")
  if (raw == null) return ""
  return raw.split(";")[0]!.trim()
}

function isStale(date: Date | null | undefined): boolean {
  if (!date) return true
  return Date.now() - date.getTime() >= STALE_THRESHOLD_MS
}

/** Sync repository list from registry → PG. Fast: one registry API call. */
export async function syncRepositories(): Promise<void> {
  const names = await listRepositories()
  if (names.length === 0) return

  // Remove repos that no longer exist in the registry
  await db.delete(repositories).where(notInArray(repositories.name, names))

  // Insert new repos with epoch lastSyncedAt so syncRepository treats them as immediately stale
  await db
    .insert(repositories)
    .values(
      names.map((name) => ({
        name,
        visibility: "private",
        lastSyncedAt: new Date(0),
      })),
    )
    .onConflictDoNothing()
}

/**
 * Sync tags + manifests for a single repository → PG.
 * Only syncs if the repo entry is stale or missing, unless force=true.
 * Resolves OCI / Docker v2 manifest lists, fetches config blobs for labels and os/arch/created.
 */
export async function syncRepository(name: string, force = false): Promise<void> {
  if (!force) {
    const [existing] = await db
      .select({ lastSyncedAt: repositories.lastSyncedAt })
      .from(repositories)
      .where(eq(repositories.name, name))
      .limit(1)

    if (!isStale(existing?.lastSyncedAt)) return
  }

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
        const contentDigest = res.headers.get("Docker-Content-Digest")
        const mediaType = contentTypeMediaTypeFromGet((k) => res.headers.get(k))
        const manifest = (await res.json()) as Record<string, unknown>

        const resolved = await resolveToImageManifest(name, manifest, mediaType)
        if (resolved) {
          const { layers, configDigest } = resolved
          const size = layers.reduce((a, l) => a + l.size, 0)
          let os: string | null = null
          let arch: string | null = null
          let createdAt: Date | null = null
          let labels: Record<string, string> | null = null
          if (configDigest) {
            const blob = await getJsonBlob(name, configDigest)
            const parsed = parseConfigBlob(blob)
            os = parsed.os
            arch = parsed.architecture
            createdAt = parsed.createdAt
            labels = parsed.labels
          }
          return {
            tag,
            totalSize: size,
            os,
            architecture: arch,
            createdAt,
            labels,
            digest: contentDigest ?? undefined,
          }
        }

        // Fallback: schema1 or unusual manifests — use embedded data only
        const rawLayers = (manifest.layers ?? manifest.fsLayers ?? []) as Array<Record<string, unknown>>
        const size = rawLayers.map((l) => Number(l.size ?? 0)).reduce((a, b) => a + b, 0)
        const mConfig = manifest.config as
          | { os?: string; architecture?: string; created?: string; digest?: string }
          | undefined
        return {
          tag,
          totalSize: size,
          os: mConfig?.os ?? null,
          architecture: mConfig?.architecture ?? null,
          createdAt: mConfig?.created ? new Date(mConfig.created) : null,
          labels: null as Record<string, string> | null,
          digest: contentDigest ?? mConfig?.digest,
        }
      }),
    )

    for (const result of results) {
      if (!result.value) continue
      const v = result.value
      totalSize += v.totalSize
      metaRows.push({
        repository: name,
        tag: v.tag,
        digest: v.digest ?? null,
        totalSize: v.totalSize,
        os: v.os,
        architecture: v.architecture,
        createdAt: v.createdAt,
        labels: v.labels,
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
          labels: sql`excluded.labels`,
          lastSyncedAt: sql`excluded.last_synced_at`,
        },
      })
  }

  // Remove metadata for tags that no longer exist in the registry
  if (tags.length > 0) {
    await db
      .delete(imageMetadata)
      .where(and(eq(imageMetadata.repository, name), notInArray(imageMetadata.tag, tags)))
  } else {
    await db.delete(imageMetadata).where(eq(imageMetadata.repository, name))
  }

  // Upsert repository row with fresh tag count + size
  await db
    .insert(repositories)
    .values({
      name,
      tagCount: tags.length,
      sizeBytes: totalSize,
      visibility: "private",
      lastSyncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: repositories.name,
      set: { tagCount: tags.length, sizeBytes: totalSize, lastSyncedAt: new Date() },
    })
}

/** Full sync: all repos + their tags. Can be slow for large registries. */
export async function syncAll(force = false): Promise<void> {
  await syncRepositories()
  const names = await listRepositories()
  await Promise.allSettled(names.map((name) => syncRepository(name, force)))
}
