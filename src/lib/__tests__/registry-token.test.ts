import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import { generateKeyPair, exportPKCS8, importPKCS8, importSPKI, jwtVerify } from "jose"
import { issueRegistryToken, computeGrantedScope, splitCommaScopeActions } from "@/lib/registry-token"

const { mockSelect, mockLimit, mockWhere, mockFrom, mockInnerJoin, mockExecute } = vi.hoisted(() => {
  const mockExecute = vi.fn().mockResolvedValue([])
  let lastSelectArgs: any = null

  const queryInterface = {
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(function() {
      return {
        then: (onFullfilled: any) => {
          // Verify select was called with expected fields to kill ObjectLiteral mutants
          if (lastSelectArgs && Object.keys(lastSelectArgs).length === 0) {
             return Promise.resolve([]).then(onFullfilled)
          }
          return mockExecute().then(onFullfilled)
        }
      }
    }),
    then: (onFullfilled: any) => {
      if (lastSelectArgs && Object.keys(lastSelectArgs).length === 0) {
         return Promise.resolve([]).then(onFullfilled)
      }
      return mockExecute().then(onFullfilled)
    }
  }

  const mockFrom = vi.fn().mockReturnValue(queryInterface)
  const mockSelect = vi.fn().mockImplementation((args) => {
    lastSelectArgs = args
    return { from: mockFrom }
  })

  return { 
    mockSelect, 
    mockFrom, 
    mockInnerJoin: queryInterface.innerJoin, 
    mockWhere: queryInterface.where, 
    mockLimit: queryInterface.limit, 
    mockExecute 
  }
})

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
  },
}))

let privatePem: string
let publicKey: CryptoKey

beforeAll(async () => {
  const { privateKey, publicKey: pub } = await generateKeyPair("RS256", { extractable: true })
  privatePem = await exportPKCS8(privateKey)
  publicKey = pub as CryptoKey
})

describe("splitCommaScopeActions", () => {
  it("omits empty segments (but keeps valid comma-separated parts)", () => {
    expect(splitCommaScopeActions("pull,,push,")).toEqual(["pull", "push"])
  })

  it("returns [] for a string of only commas", () => {
    expect(splitCommaScopeActions(",,,")).toEqual([])
  })
})

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv("REGISTRY_TOKEN_PRIVATE_KEY", privatePem.replace(/\n/g, "\\n"))
  vi.stubEnv("REGISTRY_TOKEN_ISSUER", "test-issuer")
  mockExecute.mockReset()
  mockExecute.mockResolvedValue([])
  mockSelect.mockClear()
  mockFrom.mockClear()
  mockInnerJoin.mockClear()
  mockWhere.mockClear()
  mockLimit.mockClear()
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

  it("handles newlines in private key correctly", async () => {
    const multiLineKey = privatePem.replace(/\n/g, "\\n")
    vi.stubEnv("REGISTRY_TOKEN_PRIVATE_KEY", multiLineKey)
    const token = await issueRegistryToken({ subject: "alice", service: "svc", scope: "repository:r:pull" })
    const { payload } = await jwtVerify(token, publicKey)
    expect(payload.access).toEqual([{ type: "repository", name: "r", actions: ["pull"] }])
  })

  it("restores real newlines from env-escaped \\n before import (same transform as application code)", async () => {
    const withEscapes = privatePem.replace(/\n/g, "\\n")
    const fixed = withEscapes.replace(/\\n/g, "\n")
    await expect(importPKCS8(fixed, "RS256")).resolves.toBeInstanceOf(CryptoKey)
    vi.stubEnv("REGISTRY_TOKEN_PRIVATE_KEY", withEscapes)
    const t = await issueRegistryToken({ subject: "a", service: "s", scope: "repository:r:pull" })
    const { payload } = await jwtVerify(t, publicKey)
    expect(payload.sub).toBe("a")
  })

  it("filters empty actions in scope", async () => {
    const token = await issueRegistryToken({
      subject: "alice",
      service: "svc",
      scope: "repository:myrepo:pull,,push,",
    })
    const { payload } = await jwtVerify(token, publicKey)
    expect(payload.access).toEqual([
      { type: "repository", name: "myrepo", actions: ["pull", "push"] },
    ])
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
  it("returns empty string for empty scope", async () => {
    expect(await computeGrantedScope("", ["admin"])).toBe("")
  })

  it("returns empty string when requested scope is undefined (falsy guard)", async () => {
    expect(await computeGrantedScope(undefined as unknown as string, ["admin"])).toBe("")
  })

  it("returns empty string for scope with fewer than 3 parts", async () => {
    expect(await computeGrantedScope("repository:only", ["admin"])).toBe("")
  })

  it("admin grants all actions including delete and *", async () => {
    expect(await computeGrantedScope("repository:r:pull,push,delete,*", ["admin"])).toBe(
      "repository:r:pull,push,delete,*",
    )
  })

  it("push role grants pull and push but not delete", async () => {
    expect(await computeGrantedScope("repository:r:pull,push,delete", ["push"])).toBe(
      "repository:r:pull,push",
    )
  })

  it("viewer role grants pull only", async () => {
    expect(await computeGrantedScope("repository:r:pull,push", ["viewer"])).toBe("repository:r:pull")
  })

  it("no matching role grants nothing, returns empty string", async () => {
    expect(await computeGrantedScope("repository:r:pull", [])).toBe("")
  })

  it("unknown action is not granted", async () => {
    expect(await computeGrantedScope("repository:r:write", ["admin"])).toBe("")
  })

  it("admin implies push and pull too", async () => {
    expect(await computeGrantedScope("repository:r:pull,push", ["admin"])).toBe("repository:r:pull,push")
  })

  it("filters empty actions in requested scope", async () => {
    expect(await computeGrantedScope("repository:r:pull,,push,", ["admin"])).toBe("repository:r:pull,push")
  })

  it("returns empty string if requestedScope is empty", async () => {
    expect(await computeGrantedScope("", ["admin"])).toBe("")
  })

  it("handles userId without repository type and ensures no DB calls", async () => {
    mockSelect.mockClear()
    expect(await computeGrantedScope("registry:catalog:*", ["viewer"], "u1")).toBe("")
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it("handles repository type without userId and ensures no DB calls", async () => {
    mockSelect.mockClear()
    expect(await computeGrantedScope("repository:r:pull", ["viewer"], undefined)).toBe("repository:r:pull")
    expect(mockSelect).not.toHaveBeenCalled()
  })

  it("filters multiple empty actions in requested scope", async () => {
    expect(await computeGrantedScope("repository:r:pull,,,push,", ["admin"])).toBe("repository:r:pull,push")
  })

  it("handles neither userId nor repository type", async () => {
    expect(await computeGrantedScope("registry:catalog:*", ["admin"], undefined)).toBe("registry:catalog:*")
  })

  it("handles userId false and repository type true", async () => {
    expect(await computeGrantedScope("repository:r:pull", ["viewer"], "")).toBe("repository:r:pull")
  })

  it("handles userId true and repository type false", async () => {
    expect(await computeGrantedScope("registry:catalog:*", ["viewer"], "u1")).toBe("")
  })

  it("handles both false", async () => {
    expect(await computeGrantedScope("registry:catalog:*", ["admin"], "")).toBe("registry:catalog:*")
  })

  describe("Token Constraints", () => {
    it("returns empty string if repository name mismatch", async () => {
      expect(await computeGrantedScope("repository:r1:pull", ["admin"], "u1", { repositoryName: "r2" })).toBe("")
    })

    it("grants access if repository name matches", async () => {
      expect(await computeGrantedScope("repository:r1:pull", ["admin"], "u1", { repositoryName: "r1" })).toBe("repository:r1:pull")
    })

    it("grants access if organization matches", async () => {
      mockExecute.mockResolvedValueOnce([{ role: "owner", orgId: "org1" }])
      expect(await computeGrantedScope("repository:r1:pull", [], "u1", { organizationId: "org1" })).toBe("repository:r1:pull")
    })

    it("returns empty string if organization mismatch", async () => {
      mockExecute.mockResolvedValueOnce([{ role: "owner", orgId: "org1" }])
      expect(await computeGrantedScope("repository:r1:pull", [], "u1", { organizationId: "org2" })).toBe("")
    })
  })

  describe("Organization Roles", () => {
    it("grants owner full access", async () => {
      mockExecute.mockResolvedValueOnce([{ role: "owner", orgId: "org1" }])
      expect(await computeGrantedScope("repository:r:pull,push,delete,*", [], "u1")).toBe("repository:r:pull,push,delete,*")
    })

    it("grants admin full access", async () => {
      mockExecute.mockResolvedValueOnce([{ role: "admin", orgId: "org1" }])
      expect(await computeGrantedScope("repository:r:pull,push,delete,*", [], "u1")).toBe("repository:r:pull,push,delete,*")
    })

    it("grants developer push and pull", async () => {
      mockExecute.mockResolvedValueOnce([{ role: "developer", orgId: "org1" }])
      expect(await computeGrantedScope("repository:r:pull,push,delete", [], "u1")).toBe("repository:r:pull,push")
    })

    it("grants push role push and pull", async () => {
      mockExecute.mockResolvedValueOnce([{ role: "push", orgId: "org1" }])
      expect(await computeGrantedScope("repository:r:pull,push,delete", [], "u1")).toBe("repository:r:pull,push")
    })

    it("grants viewer pull only", async () => {
      mockExecute.mockResolvedValueOnce([{ role: "viewer", orgId: "org1" }])
      expect(await computeGrantedScope("repository:r:pull,push", [], "u1")).toBe("repository:r:pull")
    })

    it("grants member pull only", async () => {
      mockExecute.mockResolvedValueOnce([{ role: "member", orgId: "org1" }])
      expect(await computeGrantedScope("repository:r:pull,push", [], "u1")).toBe("repository:r:pull")
    })

    it("grants pull role pull only", async () => {
      mockExecute.mockResolvedValueOnce([{ role: "pull", orgId: "org1" }])
      expect(await computeGrantedScope("repository:r:pull,push", [], "u1")).toBe("repository:r:pull")
    })

    it("grants nothing for other roles", async () => {
      mockExecute.mockResolvedValueOnce([{ role: "guest", orgId: "org1" }])
      expect(await computeGrantedScope("repository:r:pull,push", [], "u1")).toBe("")
    })
  })

  describe("Direct Repository Permissions", () => {
    it("grants direct admin full access", async () => {
      mockExecute.mockResolvedValueOnce([]) // No org access
      mockExecute.mockResolvedValueOnce([{ permission: "admin" }]) // Direct access
      expect(await computeGrantedScope("repository:r:pull,push,delete,*", [], "u1")).toBe("repository:r:pull,push,delete,*")
    })

    it("grants direct push access", async () => {
      mockExecute.mockResolvedValueOnce([])
      mockExecute.mockResolvedValueOnce([{ permission: "push" }])
      expect(await computeGrantedScope("repository:r:pull,push,delete", [], "u1")).toBe("repository:r:pull,push")
    })

    it("grants direct pull access", async () => {
      mockExecute.mockResolvedValueOnce([])
      mockExecute.mockResolvedValueOnce([{ permission: "pull" }])
      expect(await computeGrantedScope("repository:r:pull,push", [], "u1")).toBe("repository:r:pull")
    })

    it("grants nothing for unknown direct permission", async () => {
      mockExecute.mockResolvedValueOnce([])
      mockExecute.mockResolvedValueOnce([{ permission: "none" }])
      expect(await computeGrantedScope("repository:r:pull,push", [], "u1")).toBe("")
    })
  })

  describe("Namespaced Repositories", () => {
    it("global admin bypasses namespace check without DB calls", async () => {
      mockSelect.mockClear()
      const result = await computeGrantedScope("repository:other-user/image:pull,push,delete,*", ["admin"], "u1")
      expect(result).toBe("repository:other-user/image:pull,push,delete,*")
      expect(mockSelect).not.toHaveBeenCalled()
    })

    it("grants push+pull to user in their own namespace", async () => {
      mockExecute.mockResolvedValueOnce([{ username: "sofia" }]) // users lookup
      expect(await computeGrantedScope("repository:sofia/myapp:pull,push", ["push"], "u1")).toBe("repository:sofia/myapp:pull,push")
    })

    it("grants pull only to viewer in their own namespace", async () => {
      mockExecute.mockResolvedValueOnce([{ username: "sofia" }])
      expect(await computeGrantedScope("repository:sofia/myapp:pull,push", ["viewer"], "u1")).toBe("repository:sofia/myapp:pull")
    })

    it("denies delete for push role in own namespace", async () => {
      mockExecute.mockResolvedValueOnce([{ username: "sofia" }])
      expect(await computeGrantedScope("repository:sofia/myapp:pull,push,delete", ["push"], "u1")).toBe("repository:sofia/myapp:pull,push")
    })

    it("grants full access to org owner in org namespace", async () => {
      mockExecute.mockResolvedValueOnce([{ username: "sofia" }])
      mockExecute.mockResolvedValueOnce([{ role: "owner", orgId: "org1" }])
      expect(await computeGrantedScope("repository:myorg/image:pull,push,delete,*", [], "u1")).toBe("repository:myorg/image:pull,push,delete,*")
    })

    it("grants full access to org admin in org namespace", async () => {
      mockExecute.mockResolvedValueOnce([{ username: "sofia" }])
      mockExecute.mockResolvedValueOnce([{ role: "admin", orgId: "org1" }])
      expect(await computeGrantedScope("repository:myorg/image:pull,push,delete,*", [], "u1")).toBe("repository:myorg/image:pull,push,delete,*")
    })

    it("grants push+pull to org developer in org namespace", async () => {
      mockExecute.mockResolvedValueOnce([{ username: "sofia" }])
      mockExecute.mockResolvedValueOnce([{ role: "developer", orgId: "org1" }])
      expect(await computeGrantedScope("repository:myorg/image:pull,push,delete", [], "u1")).toBe("repository:myorg/image:pull,push")
    })

    it("grants push+pull to org push role in org namespace", async () => {
      mockExecute.mockResolvedValueOnce([{ username: "sofia" }])
      mockExecute.mockResolvedValueOnce([{ role: "push", orgId: "org1" }])
      expect(await computeGrantedScope("repository:myorg/image:pull,push,delete", [], "u1")).toBe("repository:myorg/image:pull,push")
    })

    it("grants pull only to org member in org namespace", async () => {
      mockExecute.mockResolvedValueOnce([{ username: "sofia" }])
      mockExecute.mockResolvedValueOnce([{ role: "member", orgId: "org1" }])
      expect(await computeGrantedScope("repository:myorg/image:pull,push", [], "u1")).toBe("repository:myorg/image:pull")
    })

    it("grants pull only to org viewer in org namespace", async () => {
      mockExecute.mockResolvedValueOnce([{ username: "sofia" }])
      mockExecute.mockResolvedValueOnce([{ role: "viewer", orgId: "org1" }])
      expect(await computeGrantedScope("repository:myorg/image:pull,push", [], "u1")).toBe("repository:myorg/image:pull")
    })

    it("grants pull only to org pull role in org namespace", async () => {
      mockExecute.mockResolvedValueOnce([{ username: "sofia" }])
      mockExecute.mockResolvedValueOnce([{ role: "pull", orgId: "org1" }])
      expect(await computeGrantedScope("repository:myorg/image:pull,push", [], "u1")).toBe("repository:myorg/image:pull")
    })

    it("denies delete and * to org viewer (isAdmin must stay false)", async () => {
      mockExecute.mockResolvedValueOnce([{ username: "sofia" }])
      mockExecute.mockResolvedValueOnce([{ role: "viewer", orgId: "org1" }])
      expect(await computeGrantedScope("repository:myorg/image:delete,*,pull", [], "u1")).toBe("repository:myorg/image:pull")
    })

    it("denies access for unknown org role", async () => {
      mockExecute.mockResolvedValueOnce([{ username: "sofia" }])
      mockExecute.mockResolvedValueOnce([{ role: "guest", orgId: "org1" }])
      expect(await computeGrantedScope("repository:myorg/image:pull,push", [], "u1")).toBe("")
    })

    it("denies access to foreign user namespace", async () => {
      mockExecute.mockResolvedValueOnce([{ username: "sofia" }])
      mockExecute.mockResolvedValueOnce([]) // no org with that slug
      expect(await computeGrantedScope("repository:other-user/image:pull,push", ["push"], "u1")).toBe("")
    })

    it("denies access when org slug not found", async () => {
      mockExecute.mockResolvedValueOnce([{ username: "sofia" }])
      mockExecute.mockResolvedValueOnce([]) // no org match
      expect(await computeGrantedScope("repository:unknown-org/image:pull", [], "u1")).toBe("")
    })

    it("denies when user row not found", async () => {
      mockExecute.mockResolvedValueOnce([]) // no user found
      expect(await computeGrantedScope("repository:myorg/image:pull", [], "u1")).toBe("")
    })

    it("enforces org token constraint mismatch on namespaced repo", async () => {
      mockExecute.mockResolvedValueOnce([{ username: "sofia" }])
      mockExecute.mockResolvedValueOnce([{ role: "developer", orgId: "org1" }])
      expect(await computeGrantedScope("repository:myorg/image:pull,push", [], "u1", { organizationId: "org2" })).toBe("")
    })

    it("passes org token constraint when matching namespaced repo", async () => {
      mockExecute.mockResolvedValueOnce([{ username: "sofia" }])
      mockExecute.mockResolvedValueOnce([{ role: "owner", orgId: "org1" }])
      expect(await computeGrantedScope("repository:myorg/image:pull,push", [], "u1", { organizationId: "org1" })).toBe("repository:myorg/image:pull,push")
    })

    it("enforces repositoryName token constraint on namespaced repo", async () => {
      expect(await computeGrantedScope("repository:myorg/image:pull", ["admin"], "u1", { repositoryName: "myorg/other" })).toBe("")
    })
  })
})
