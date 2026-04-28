import { issueRegistryToken } from "./registry-token"

export const MANIFEST_ACCEPT =
  "application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json"

export const BLOB_ACCEPT =
  "application/vnd.oci.image.config.v1+json, application/vnd.docker.container.image.v1+json, application/json"

/** Max config blob size to avoid runaway memory during sync (2 MiB). */
export const CONFIG_BLOB_MAX_BYTES = 2 * 1024 * 1024

/** Interprets Content-Length header; NaN if missing, empty, or not an integer. */
export function parseContentLengthHeader(value: string | null | undefined): number {
  if (typeof value !== "string") return Number.NaN
  // Stryker disable next-line ConditionalExpression: if(false) is equivalent to parseInt("",10) for empty string
  if (value.length === 0) return Number.NaN
  return parseInt(value, 10)
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>()

/** Parses a Bearer WWW-Authenticate challenge, self-issues a registry JWT, caches it. */
async function resolveBearerChallenge(wwwAuth: string | null): Promise<string | null> {
  if (!wwwAuth) return null
  const scopeMatch = wwwAuth.match(/scope="([^"]+)"/)
  const scope = scopeMatch?.[1]
  if (!scope) return null

  const cached = tokenCache.get(scope)
  if (cached && cached.expiresAt > Date.now()) return cached.token

  // Extract service from the challenge itself so it always matches what the registry expects,
  // regardless of how REGISTRY_AUTH_TOKEN_SERVICE is configured in the app env.
  const serviceMatch = wwwAuth.match(/service="([^"]+)"/)
  const service = serviceMatch?.[1] ?? process.env.REGISTRY_AUTH_TOKEN_SERVICE ?? "registry.local"
  try {
    const token = await issueRegistryToken({ subject: "system", service, scope })
    // Cache for 4 min — JWT lifetime is 5 min, leave 1 min margin
    tokenCache.set(scope, { token, expiresAt: Date.now() + 4 * 60 * 1000 })
    return token
  } catch (e) {
    console.error(`[registry-client] failed to issue internal token for scope=${scope}:`, e)
    return null
  }
}

async function registryFetch(path: string, options?: RequestInit) {
  const url = `${process.env.REGISTRY_URL ?? "http://localhost:5000"}/v2${path}`
  const headers: Record<string, string> = {
    Accept: MANIFEST_ACCEPT,
    ...(options?.headers as Record<string, string> ?? {}),
  }

  const res = await fetch(url, { ...options, headers })

  // Docker Registry v2 token auth: on 401, obtain a Bearer token and retry once
  if (res.status === 401) {
    const token = await resolveBearerChallenge(res.headers.get("www-authenticate"))
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
      const retried = await fetch(url, { ...options, headers })
      if (!retried.ok) {
        console.error(`[registry-client] auth retry failed: ${retried.status} ${retried.statusText} for ${url}`)
      }
      return retried
    }
    console.error(`[registry-client] 401 with no resolvable Bearer challenge for ${url}`)
  }

  return res
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
  const res = await registryFetch(`/${name}/blobs/${digest}`, {
    headers: { Accept: BLOB_ACCEPT },
  })
  if (!res.ok) return null
  const parsedLength = parseContentLengthHeader(res.headers.get("content-length"))
  if (!Number.isNaN(parsedLength) && parsedLength > maxBytes) return null
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
