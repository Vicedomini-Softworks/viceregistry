import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockIssueRegistryToken } = vi.hoisted(() => {
  const mockIssueRegistryToken = vi.fn().mockResolvedValue("mocked-registry-token")
  return { mockIssueRegistryToken }
})

vi.mock("@/lib/registry-token", () => ({
  issueRegistryToken: mockIssueRegistryToken,
}))

import {
  listRepositories,
  listTags,
  getManifest,
  getManifestDigest,
  getJsonBlob,
  CONFIG_BLOB_MAX_BYTES,
  deleteManifest,
  proxyRegistryRequest,
  MANIFEST_ACCEPT,
  parseContentLengthHeader,
} from "@/lib/registry-client"

function mockFetch(
  ok: boolean,
  body: unknown,
  headers: Record<string, string> = {},
  status?: number,
) {
  const normalized: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) normalized[k.toLowerCase()] = v

  const jsonMock = vi.fn().mockImplementation(async () => {
    if (!ok) throw new Error("Should not call json() on non-ok response")
    return body
  })
  return vi.fn().mockResolvedValue({
    ok,
    status: status ?? (ok ? 200 : 400),
    json: jsonMock,
    headers: {
      get: (key: string) => normalized[key.toLowerCase()] ?? null,
    },
  })
}

function make401(scope: string) {
  return {
    ok: false,
    status: 401,
    headers: {
      get: (k: string) =>
        k.toLowerCase() === "www-authenticate"
          ? `Bearer realm="http://localhost:4321/api/auth/token",service="registry.local",scope="${scope}"`
          : null,
    },
  }
}

describe("parseContentLengthHeader", () => {
  it("returns NaN for null or undefined", () => {
    expect(Number.isNaN(parseContentLengthHeader(null))).toBe(true)
    expect(Number.isNaN(parseContentLengthHeader(undefined))).toBe(true)
  })

  it("returns NaN for empty string", () => {
    expect(Number.isNaN(parseContentLengthHeader(""))).toBe(true)
  })

  it("returns parsed int for a numeric string", () => {
    expect(parseContentLengthHeader("1024")).toBe(1024)
  })

  it("returns NaN for a non-numeric value", () => {
    expect(Number.isNaN(parseContentLengthHeader("x"))).toBe(true)
  })
})

describe("registry-client", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.stubEnv("REGISTRY_URL", "http://registry:5000")
    mockIssueRegistryToken.mockResolvedValue("mocked-registry-token")
  })

  describe("default REGISTRY_URL", () => {
    it("uses localhost for getJsonBlob when REGISTRY_URL is unset", async () => {
      vi.unstubAllEnvs()
      delete process.env.REGISTRY_URL
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new TextEncoder().encode("{}").buffer,
      })
      vi.stubGlobal("fetch", fetchMock)
      await getJsonBlob("n/s", "sha256:ab")
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:5000/v2/n/s/blobs/sha256:ab",
        expect.objectContaining({ headers: expect.anything() }),
      )
      vi.stubEnv("REGISTRY_URL", "http://registry:5000")
    })

    it("uses localhost for listTags when REGISTRY_URL is unset", async () => {
      vi.unstubAllEnvs()
      delete process.env.REGISTRY_URL
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tags: [] }) })
      vi.stubGlobal("fetch", fetchMock)
      await listTags("repo")
      expect(fetchMock).toHaveBeenCalledWith("http://localhost:5000/v2/repo/tags/list", expect.anything())
      vi.stubEnv("REGISTRY_URL", "http://registry:5000")
    })
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
      const [url, opts] = fetchMock.mock.calls[0]
      expect(url).toBe("http://registry:5000/v2/_catalog?n=1000")
      expect((opts as RequestInit).headers).toMatchObject({ Accept: MANIFEST_ACCEPT })
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

  describe("getJsonBlob", () => {
    const BLOB_LITERAL =
      "application/vnd.oci.image.config.v1+json, application/vnd.docker.container.image.v1+json, application/json"

    it("sends BLOB Accept header and fetches config blob URL", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new TextEncoder().encode("{}").buffer,
      })
      vi.stubGlobal("fetch", fetchMock)
      await getJsonBlob("ns/r", "sha256:abc")
      const [, init] = fetchMock.mock.calls[0]
      expect((init as RequestInit).headers).toEqual({ Accept: BLOB_LITERAL })
    })

    it("reads content-length with header name content-length (not an empty string)", async () => {
      const h = vi.fn((k: string) => (k === "content-length" ? "2" : null))
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: h },
        arrayBuffer: async () => new TextEncoder().encode('{}').buffer,
      })
      vi.stubGlobal("fetch", fetchMock)
      await getJsonBlob("ns/r", "sha256:abc", 1_000_000)
      expect(h).toHaveBeenCalledWith("content-length")
    })

    it("does not drop JSON when content-length equals maxBytes (n > maxBytes is strict)", async () => {
      const json = '{"a":1}'
      const maxB = new TextEncoder().encode(json).byteLength
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          headers: { get: (k: string) => (k === "content-length" ? String(maxB) : null) },
          arrayBuffer: async () => new TextEncoder().encode(json).buffer,
        }),
      )
      expect(await getJsonBlob("ns/r", "sha256:abc", maxB)).toEqual({ a: 1 })
    })

    it("returns null when content-length (parsed) is over maxBytes, without reading a smaller body (header wins)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          headers: { get: (k: string) => (k === "content-length" ? "999999" : null) },
          arrayBuffer: async () => new TextEncoder().encode("{}").buffer,
        }),
      )
      expect(await getJsonBlob("ns/r", "sha256:abc", 1_000)).toBeNull()
    })

    it("returns parsed JSON for small ok response", async () => {
      const body = { os: "linux", config: { Labels: { "org.opencontainers.image.title": "T" } } }
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          headers: { get: (k: string) => (k === "content-length" ? "100" : null) },
          arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer,
        }),
      )
      const out = await getJsonBlob("ns/r", "sha256:abc")
      expect(out).toEqual(body)
    })

    it("returns null when content-length exceeds cap", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          headers: { get: (k: string) => (k === "content-length" ? "99999999" : null) },
          arrayBuffer: async () => new ArrayBuffer(0),
        }),
      )
      const out = await getJsonBlob("ns/r", "sha256:abc", 1000)
      expect(out).toBeNull()
    })

    it("rejects oversize from header even when the body bytes are small", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          headers: { get: (k: string) => (k === "content-length" ? "500" : null) },
          arrayBuffer: async () => new TextEncoder().encode("{}").buffer,
        }),
      )
      expect(await getJsonBlob("ns/r", "sha256:abc", 100)).toBeNull()
    })

    it("returns null when response is not ok (even if body is valid JSON)", async () => {
      const goodJson = new TextEncoder().encode('{"a":1}').buffer
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          headers: { get: () => null },
          arrayBuffer: async () => goodJson,
        }),
      )
      expect(await getJsonBlob("ns/r", "sha256:abc")).toBeNull()
    })

    it("returns null when body is not valid JSON", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          headers: { get: () => null },
          arrayBuffer: async () => new TextEncoder().encode("not valid json{").buffer,
        }),
      )
      expect(await getJsonBlob("ns/r", "sha256:abc")).toBeNull()
    })

    it("returns null when no content-length but body is larger than maxBytes", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          headers: { get: () => null },
          arrayBuffer: async () => new ArrayBuffer(5000),
        }),
      )
      expect(await getJsonBlob("ns/r", "sha256:abc", 1000)).toBeNull()
    })

    it("ignores empty content-length string and enforces size on the body", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          headers: { get: (k: string) => (k === "content-length" ? "" : null) },
          arrayBuffer: async () => new TextEncoder().encode("{}").buffer,
        }),
      )
      expect(await getJsonBlob("ns/r", "sha256:abc", 1)).toBeNull()
    })

    it("does not short-circuit when content-length is not a number (reads body, then enforces size)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          headers: { get: (k: string) => (k === "content-length" ? "NaN" : null) },
          arrayBuffer: async () => new TextEncoder().encode("{}").buffer,
        }),
      )
      expect(await getJsonBlob("ns/r", "sha256:abc", 10)).toEqual({})
    })

    it("parses JSON when content-length header is not set", async () => {
      const body = { x: 1 }
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          headers: { get: () => null },
          arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer,
        }),
      )
      expect(await getJsonBlob("ns/r", "sha256:abc", CONFIG_BLOB_MAX_BYTES)).toEqual(body)
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

  describe("401 Bearer auth retry", () => {
    it("retries with Bearer token and returns data on success", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(make401("registry:catalog:*"))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ repositories: ["repo1", "repo2"] }),
          headers: { get: () => null },
        })
      vi.stubGlobal("fetch", fetchMock)

      const result = await listRepositories()

      expect(result).toEqual(["repo1", "repo2"])
      expect(fetchMock).toHaveBeenCalledTimes(2)
      const [, retryOpts] = fetchMock.mock.calls[1]
      expect(retryOpts.headers["Authorization"]).toBe("Bearer mocked-registry-token")
    })

    it("issues token scoped to the WWW-Authenticate challenge", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(make401("repository:myrepo:pull"))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ tags: ["v1"] }),
          headers: { get: () => null },
        })
      vi.stubGlobal("fetch", fetchMock)

      await listTags("myrepo")

      expect(mockIssueRegistryToken).toHaveBeenCalledWith(
        expect.objectContaining({ scope: "repository:myrepo:pull" }),
      )
    })

    it("does not retry when 401 has no www-authenticate header", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: { get: () => null },
      })
      vi.stubGlobal("fetch", fetchMock)

      const result = await listRepositories()

      expect(result).toEqual([])
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("does not retry when www-authenticate has no scope", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: {
          get: (k: string) =>
            k.toLowerCase() === "www-authenticate"
              ? `Bearer realm="http://localhost:4321/api/auth/token",service="registry.local"`
              : null,
        },
      })
      vi.stubGlobal("fetch", fetchMock)

      const result = await listRepositories()

      expect(result).toEqual([])
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("returns empty/null when retry also fails", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(make401("registry:catalog:*"))
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          headers: { get: () => null },
          json: async () => ({}),
        })
      vi.stubGlobal("fetch", fetchMock)

      const result = await listRepositories()

      expect(result).toEqual([])
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it("does not retry non-401 failures", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => null },
      })
      vi.stubGlobal("fetch", fetchMock)

      await listRepositories()

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("does not retry when issueRegistryToken throws", async () => {
      mockIssueRegistryToken.mockRejectedValueOnce(new Error("key not configured"))
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(make401("registry:catalog:unique-throw-scope"))
      vi.stubGlobal("fetch", fetchMock)

      const result = await listRepositories()

      expect(result).toEqual([])
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("passes Bearer token to getJsonBlob on 401", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(make401("repository:ns/r:pull"))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: { get: () => null },
          arrayBuffer: async () => new TextEncoder().encode('{"os":"linux"}').buffer,
        })
      vi.stubGlobal("fetch", fetchMock)

      const result = await getJsonBlob("ns/r", "sha256:abc")

      expect(result).toEqual({ os: "linux" })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      const [, retryOpts] = fetchMock.mock.calls[1]
      expect(retryOpts.headers["Authorization"]).toBe("Bearer mocked-registry-token")
    })
  })
})
