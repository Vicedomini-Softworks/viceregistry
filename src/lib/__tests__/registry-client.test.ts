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
  const jsonMock = vi.fn().mockImplementation(async () => {
    if (!ok) throw new Error("Should not call json() on non-ok response")
    return body
  })
  return vi.fn().mockResolvedValue({
    ok,
    json: jsonMock,
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
      expect(url).toBe("http://registry:5000/v2/_catalog?n=1000")
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

    it("calls correct URL path", async () => {
      const fetchMock = mockFetch(true, { tags: [] })
      vi.stubGlobal("fetch", fetchMock)
      await listTags("myrepo")
      const [url] = fetchMock.mock.calls[0]
      expect(url).toBe("http://registry:5000/v2/myrepo/tags/list")
    })
  })

  describe("getManifest", () => {
    it("returns the raw fetch response", async () => {
      const fakeRes = { ok: true, json: async () => ({ schemaVersion: 2 }), headers: { get: () => null } }
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeRes))
      const res = await getManifest("myrepo", "latest")
      expect(res).toBe(fakeRes)
    })

    it("calls correct URL path", async () => {
      const fetchMock = mockFetch(true, {})
      vi.stubGlobal("fetch", fetchMock)
      await getManifest("myrepo", "latest")
      const [url] = fetchMock.mock.calls[0]
      expect(url).toBe("http://registry:5000/v2/myrepo/manifests/latest")
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

    it("calls fetch with HEAD method and correct URL", async () => {
      const fetchMock = mockFetch(true, null)
      vi.stubGlobal("fetch", fetchMock)
      await getManifestDigest("myrepo", "latest")
      const [url, opts] = fetchMock.mock.calls[0]
      expect(url).toBe("http://registry:5000/v2/myrepo/manifests/latest")
      expect(opts.method).toBe("HEAD")
    })
  })

  describe("deleteManifest", () => {
    it("calls fetch with DELETE method and correct URL", async () => {
      const fetchMock = mockFetch(true, null)
      vi.stubGlobal("fetch", fetchMock)
      await deleteManifest("myrepo", "sha256:deadbeef")
      const [url, opts] = fetchMock.mock.calls[0]
      expect(url).toBe("http://registry:5000/v2/myrepo/manifests/sha256:deadbeef")
      expect(opts.method).toBe("DELETE")
    })
  })

  describe("proxyRegistryRequest", () => {
    it("passes through to registryFetch with Accept header and merges custom headers", async () => {
      const fetchMock = mockFetch(true, {})
      vi.stubGlobal("fetch", fetchMock)
      await proxyRegistryRequest("/some/path", { method: "GET", headers: { "X-Custom": "1" } })
      const [url, opts] = fetchMock.mock.calls[0]
      expect(url).toBe("http://registry:5000/v2/some/path")
      expect(opts.headers).toEqual({
        Accept:
          "application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json",
        "X-Custom": "1",
      })
    })
  })
})
