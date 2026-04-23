const REGISTRY_URL = import.meta.env.REGISTRY_URL ?? "http://localhost:5000"

const MANIFEST_ACCEPT =
  "application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json"

async function registryFetch(path: string, options?: RequestInit) {
  const url = `${REGISTRY_URL}/v2${path}`
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
