import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import { generateKeyPair, exportPKCS8, importSPKI, jwtVerify } from "jose"
import { issueRegistryToken, computeGrantedScope } from "@/lib/registry-token"

let privatePem: string
let publicKey: CryptoKey

beforeAll(async () => {
  const { privateKey, publicKey: pub } = await generateKeyPair("RS256", { extractable: true })
  privatePem = await exportPKCS8(privateKey)
  publicKey = pub as CryptoKey
})

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv("REGISTRY_TOKEN_PRIVATE_KEY", privatePem.replace(/\n/g, "\\n"))
  vi.stubEnv("REGISTRY_TOKEN_ISSUER", "test-issuer")
})

describe("issueRegistryToken", () => {
  it("returns a signed JWT string", async () => {
    const token = await issueRegistryToken({
      subject: "alice",
      service: "registry.example.com",
      scope: "repository:myrepo:pull",
    })
    expect(typeof token).toBe("string")
    expect(token.split(".")).toHaveLength(3)
  })

  it("throws when private key env is missing", async () => {
    vi.stubEnv("REGISTRY_TOKEN_PRIVATE_KEY", "")
    await expect(
      issueRegistryToken({ subject: "alice", service: "svc", scope: "repository:r:pull" }),
    ).rejects.toThrow("REGISTRY_TOKEN_PRIVATE_KEY env var is required")
  })

  it("produces access: [] for empty scope", async () => {
    const token = await issueRegistryToken({ subject: "alice", service: "svc", scope: "" })
    const { payload } = await jwtVerify(token, publicKey)
    expect(payload.access).toEqual([])
  })

  it("produces access: [] for scope with fewer than 3 parts", async () => {
    const token = await issueRegistryToken({
      subject: "alice",
      service: "svc",
      scope: "repository:onlytwo",
    })
    const { payload } = await jwtVerify(token, publicKey)
    expect(payload.access).toEqual([])
  })

  it("parses valid scope into access array", async () => {
    const token = await issueRegistryToken({
      subject: "alice",
      service: "svc",
      scope: "repository:myrepo:pull,push",
    })
    const { payload } = await jwtVerify(token, publicKey)
    expect(payload.access).toEqual([
      { type: "repository", name: "myrepo", actions: ["pull", "push"] },
    ])
  })

  it("uses REGISTRY_TOKEN_ISSUER env", async () => {
    const token = await issueRegistryToken({ subject: "alice", service: "svc", scope: "" })
    const { payload } = await jwtVerify(token, publicKey, { issuer: "test-issuer" })
    expect(payload.iss).toBe("test-issuer")
  })

  it("defaults issuer to viceregistry when env not set", async () => {
    vi.unstubAllEnvs()
    vi.stubEnv("REGISTRY_TOKEN_PRIVATE_KEY", privatePem.replace(/\n/g, "\\n"))
    const token = await issueRegistryToken({ subject: "alice", service: "svc", scope: "" })
    const { payload } = await jwtVerify(token, publicKey, { issuer: "viceregistry" })
    expect(payload.iss).toBe("viceregistry")
  })
})

describe("computeGrantedScope", () => {
  it("returns empty string for empty scope", () => {
    expect(computeGrantedScope("", ["admin"])).toBe("")
  })

  it("returns empty string for scope with fewer than 3 parts", () => {
    expect(computeGrantedScope("repository:only", ["admin"])).toBe("")
  })

  it("admin grants all actions including delete and *", () => {
    expect(computeGrantedScope("repository:r:pull,push,delete,*", ["admin"])).toBe(
      "repository:r:pull,push,delete,*",
    )
  })

  it("push role grants pull and push but not delete", () => {
    expect(computeGrantedScope("repository:r:pull,push,delete", ["push"])).toBe(
      "repository:r:pull,push",
    )
  })

  it("viewer role grants pull only", () => {
    expect(computeGrantedScope("repository:r:pull,push", ["viewer"])).toBe("repository:r:pull")
  })

  it("no matching role grants nothing, returns empty string", () => {
    expect(computeGrantedScope("repository:r:pull", [])).toBe("")
  })

  it("unknown action is not granted", () => {
    expect(computeGrantedScope("repository:r:write", ["admin"])).toBe("")
  })

  it("admin implies push and pull too", () => {
    expect(computeGrantedScope("repository:r:pull,push", ["admin"])).toBe("repository:r:pull,push")
  })
})
