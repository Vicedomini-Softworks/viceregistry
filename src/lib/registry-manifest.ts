import { getManifest } from "./registry-client"

/**
 * Supported media types (Docker Hub–style metadata):
 * - Image: `application/vnd.docker.distribution.manifest.v2+json`, `application/vnd.oci.image.manifest.v1+json`
 * - List/index: `application/vnd.docker.distribution.manifest.list.v2+json`, `application/vnd.oci.image.index.v1+json`
 * (We resolve a list to one image manifest, preferring linux/amd64 when platform info exists.)
 */
const MANIFEST_LIST_TYPES = new Set([
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.index.v1+json",
])

function isManifestList(manifest: Record<string, unknown>, mediaType: string): boolean {
  if (MANIFEST_LIST_TYPES.has(mediaType)) return true
  if (typeof manifest.mediaType === "string" && MANIFEST_LIST_TYPES.has(manifest.mediaType)) return true
  if (Array.isArray(manifest.manifests) && (manifest as { schemaVersion?: number }).schemaVersion === 2) {
    return true
  }
  return false
}

function pickChildDescriptor(manifests: Array<Record<string, unknown>>): Record<string, unknown> | null {
  if (manifests.length === 0) return null
  const withPlat = manifests.filter((m) => m.platform)
  const linuxAmd = withPlat.find((m) => {
    const p = m.platform as { os?: string; architecture?: string } | undefined
    return p?.os === "linux" && p?.architecture === "amd64"
  })
  if (linuxAmd) return linuxAmd
  return manifests[0] ?? null
}

export type ResolvedImageLayer = { size: number }

/**
 * Unwrap manifest list/index to an image manifest; return layer sizes and config descriptor digest.
 */
export async function resolveToImageManifest(
  name: string,
  initialManifest: Record<string, unknown>,
  initialMediaType: string,
  maxDepth = 4,
): Promise<{
  layers: ResolvedImageLayer[]
  configDigest: string | null
} | null> {
  let manifest: Record<string, unknown> = initialManifest
  let mediaType = initialMediaType
  for (let depth = 0; depth < maxDepth; depth++) {
    if (isManifestList(manifest, mediaType)) {
      const manifests = manifest.manifests as Array<Record<string, unknown>> | undefined
      if (!Array.isArray(manifests) || manifests.length === 0) return null
      const child = pickChildDescriptor(manifests)
      const digest = (child?.digest as string) ?? ""
      if (!digest) return null
      const res = await getManifest(name, digest)
      if (!res.ok) return null
      mediaType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? ""
      manifest = (await res.json()) as Record<string, unknown>
      continue
    }

    const rawLayers = (manifest.layers ?? manifest.fsLayers) as Array<Record<string, unknown>> | undefined
    if (rawLayers && rawLayers.length >= 0) {
      const layers: ResolvedImageLayer[] = rawLayers.map((l) => ({
        size: Number(l.size ?? 0),
      }))
      const config = manifest.config as { digest?: string } | undefined
      return { layers, configDigest: config?.digest ?? null }
    }

    return null
  }
  return null
}

/** OCI / Docker config blob: Labels, os, arch, created. */
export function parseConfigBlob(
  blob: Record<string, unknown> | null | undefined,
): {
  os: string | null
  architecture: string | null
  createdAt: Date | null
  labels: Record<string, string> | null
} {
  if (!blob || typeof blob !== "object") {
    return { os: null, architecture: null, createdAt: null, labels: null }
  }
  const conf = blob.config as { Labels?: Record<string, string> } | undefined
  const container = (blob as { container_config?: { Labels?: Record<string, string> } }).container_config
  const l1 = container?.Labels ?? {}
  const l2 = conf?.Labels ?? {}
  const merged: Record<string, string> = { ...l1, ...l2 }
  const labels = Object.keys(merged).length > 0 ? merged : null
  const created = blob.created
  return {
    os: (blob.os as string) ?? null,
    architecture: (blob.architecture as string) ?? null,
    createdAt: typeof created === "string" && created ? new Date(created) : null,
    labels,
  }
}
