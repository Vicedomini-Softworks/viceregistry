const MANIFEST_ACCEPT =
  "application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json"

const BLOB_ACCEPT =
  "application/vnd.oci.image.config.v1+json, application/vnd.docker.container.image.v1+json, application/json"

/** Max config blob size to avoid runaway memory during sync (2 MiB). */
export const CONFIG_BLOB_MAX_BYTES = 2 * 1024 * 1024

async function registryFetch(path: string, options?: RequestInit) {
  const url = `${process.env.REGISTRY_URL ?? "http://localhost:5000"}/v2${path}`
  return fetch(url, {
    ...options,
    headers: {
      Accept: MANIFEST_ACCEPT,
      ...(options?.headers ?? {}),
    },
  })
}

export async function listRepositories(): Promise<string[]> {
  const res = await registryFetch("/_catalog?n=1000")
  if (!res.ok) return []
  const data = await res.json()
  return (data.repositories as string[]) ?? []
}

export async function listTags(name: string): Promise<string[]> {
  const res = await registryFetch(`/${name}/tags/list`)
  if (!res.ok) return []
  const data = await res.json()
  return (data.tags as string[]) ?? []
}

export async function getManifest(name: string, reference: string) {
  return registryFetch(`/${name}/manifests/${reference}`)
}

/**
 * GET an image config blob (or any blob) by digest. Enforces a size cap.
 * Returns parsed JSON or null on failure / oversize.
 */
export async function getJsonBlob(
  name: string,
  digest: string,
  maxBytes: number = CONFIG_BLOB_MAX_BYTES,
): Promise<Record<string, unknown> | null> {
  const url = `${process.env.REGISTRY_URL ?? "http://localhost:5000"}/v2/${name}/blobs/${digest}`
  const res = await fetch(url, {
    headers: { Accept: BLOB_ACCEPT },
  })
  if (!res.ok) return null
  const cl = res.headers.get("content-length")
  if (cl) {
    const n = parseInt(cl, 10)
    if (!Number.isNaN(n) && n > maxBytes) return null
  }
  const buf = await res.arrayBuffer()
  if (buf.byteLength > maxBytes) return null
  const text = new TextDecoder().decode(buf)
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function getManifestDigest(name: string, reference: string): Promise<string | null> {
  const res = await registryFetch(`/${name}/manifests/${reference}`, { method: "HEAD" })
  return res.headers.get("Docker-Content-Digest")
}

export async function deleteManifest(name: string, digest: string) {
  return registryFetch(`/${name}/manifests/${digest}`, { method: "DELETE" })
}

export async function proxyRegistryRequest(path: string, init?: RequestInit) {
  return registryFetch(path, init)
}
