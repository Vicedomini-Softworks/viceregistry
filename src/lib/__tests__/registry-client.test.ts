import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  listRepositories,
  listTags,
  getManifest,
  getManifestDigest,
  deleteManifest,
  proxyRegistryRequest,
} from "@/lib/registry-client"

function mockFetch(ok: boolean, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn().mockResolvedValue({
    ok,
    json: async () => body,
    headers: {
      get: (key: string) => headers[key] ?? null,
    },
  })
}

describe("registry-client", () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  describe("listRepositories", () => {
    it("returns repos on ok response", async () => {
      vi.stubGlobal("fetch", mockFetch(true, { repositories: ["repo1", "repo2"] }))
      const result = await listRepositories()
      expect(result).toEqual(["repo1", "repo2"])
    })

    it("returns [] on non-ok response", async () => {
      vi.stubGlobal("fetch", mockFetch(false, {}))
      const result = await listRepositories()
      expect(result).toEqual([])
    })

    it("returns [] when repositories key missing", async () => {
      vi.stubGlobal("fetch", mockFetch(true, {}))
      const result = await listRepositories()
      expect(result).toEqual([])
    })

    it("calls correct URL path", async () => {
      const fetchMock = mockFetch(true, { repositories: [] })
      vi.stubGlobal("fetch", fetchMock)
      await listRepositories()
      const [url] = fetchMock.mock.calls[0]
      expect(url).toContain("/v2/_catalog?n=1000")
    })
  })

  describe("listTags", () => {
    it("returns tags on ok response", async () => {
      vi.stubGlobal("fetch", mockFetch(true, { tags: ["latest", "v1.0"] }))
      const result = await listTags("myrepo")
      expect(result).toEqual(["latest", "v1.0"])
    })

    it("returns [] on non-ok response", async () => {
      vi.stubGlobal("fetch", mockFetch(false, {}))
      const result = await listTags("myrepo")
      expect(result).toEqual([])
    })

    it("returns [] when tags key missing", async () => {
      vi.stubGlobal("fetch", mockFetch(true, {}))
      const result = await listTags("myrepo")
      expect(result).toEqual([])
    })
  })

  describe("getManifest", () => {
    it("returns the raw fetch response", async () => {
      const fakeRes = { ok: true, json: async () => ({ schemaVersion: 2 }), headers: { get: () => null } }
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeRes))
      const res = await getManifest("myrepo", "latest")
      expect(res).toBe(fakeRes)
    })
  })

  describe("getManifestDigest", () => {
    it("returns digest header value", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch(true, null, { "Docker-Content-Digest": "sha256:abc123" }),
      )
      const digest = await getManifestDigest("myrepo", "latest")
      expect(digest).toBe("sha256:abc123")
    })

    it("returns null when header absent", async () => {
      vi.stubGlobal("fetch", mockFetch(true, null))
      const digest = await getManifestDigest("myrepo", "latest")
      expect(digest).toBeNull()
    })

    it("calls fetch with HEAD method", async () => {
      const fetchMock = mockFetch(true, null)
      vi.stubGlobal("fetch", fetchMock)
      await getManifestDigest("myrepo", "latest")
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: "HEAD" }),
      )
    })
  })

  describe("deleteManifest", () => {
    it("calls fetch with DELETE method", async () => {
      const fetchMock = mockFetch(true, null)
      vi.stubGlobal("fetch", fetchMock)
      await deleteManifest("myrepo", "sha256:deadbeef")
      const [url, opts] = fetchMock.mock.calls[0]
      expect(url).toContain("/v2/myrepo/manifests/sha256:deadbeef")
      expect(opts.method).toBe("DELETE")
    })
  })

  describe("proxyRegistryRequest", () => {
    it("passes through to registryFetch with Accept header", async () => {
      const fetchMock = mockFetch(true, {})
      vi.stubGlobal("fetch", fetchMock)
      await proxyRegistryRequest("/some/path", { method: "GET" })
      const [url, opts] = fetchMock.mock.calls[0]
      expect(url).toContain("/v2/some/path")
      expect(opts.headers).toHaveProperty("Accept")
    })
  })
})
