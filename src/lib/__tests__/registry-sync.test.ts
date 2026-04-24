import { describe, it, expect, vi, beforeEach } from "vitest"

// Hoisted mock functions so they're available in vi.mock factories
const {
  mockInsert,
  mockValues,
  mockOnConflictDoUpdate,
  mockSelect,
  mockLimit,
  mockListRepositories,
  mockListTags,
  mockGetManifest,
  mockGetJsonBlob,
} = vi.hoisted(() => {
  const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
  const mockValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }))
  const mockInsert = vi.fn(() => ({ values: mockValues }))
  const mockLimit = vi.fn().mockResolvedValue([])
  const mockWhere = vi.fn(() => ({ limit: mockLimit }))
  const mockFrom = vi.fn(() => ({ where: mockWhere }))
  const mockSelect = vi.fn(() => ({ from: mockFrom }))
  const mockListRepositories = vi.fn().mockResolvedValue([])
  const mockListTags = vi.fn().mockResolvedValue([])
  const mockGetManifest = vi.fn()
  const mockGetJsonBlob = vi.fn()
  return {
    mockInsert,
    mockValues,
    mockOnConflictDoUpdate,
    mockSelect,
    mockLimit,
    mockListRepositories,
    mockListTags,
    mockGetManifest,
    mockGetJsonBlob,
  }
})

vi.mock("@/lib/db", () => ({
  db: { insert: mockInsert, select: mockSelect },
}))

vi.mock("@/lib/schema", () => ({
  repositories: { name: "name", lastSyncedAt: "last_synced_at" },
  imageMetadata: { repository: "repository", tag: "tag" },
}))

vi.mock("@/lib/registry-client", () => ({
  listRepositories: mockListRepositories,
  listTags: mockListTags,
  getManifest: mockGetManifest,
  getJsonBlob: mockGetJsonBlob,
}))

import { syncRepositories, syncRepository, syncAll } from "@/lib/registry-sync"

function mockManifestHeaders() {
  return {
    get: (k: string) => {
      if (k === "content-type") return "application/vnd.docker.distribution.manifest.v2+json"
      if (k === "Docker-Content-Digest") return "sha256:manifestlayer"
      return null
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockOnConflictDoUpdate.mockResolvedValue(undefined)
  mockLimit.mockResolvedValue([])
  mockListRepositories.mockResolvedValue([])
  mockListTags.mockResolvedValue([])
  mockGetJsonBlob.mockResolvedValue({
    os: "linux",
    architecture: "amd64",
    created: "2024-01-01T00:00:00.000Z",
    config: { Labels: {} },
  })
})

describe("syncRepositories", () => {
  it("does nothing when registry returns empty list", async () => {
    mockListRepositories.mockResolvedValue([])
    await syncRepositories()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it("upserts repository rows when names returned", async () => {
    mockListRepositories.mockResolvedValue(["repo1", "repo2"])
    await syncRepositories()
    expect(mockInsert).toHaveBeenCalled()
    expect(mockValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: "repo1" }),
        expect.objectContaining({ name: "repo2" }),
      ]),
    )
    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.anything(),
        set: expect.objectContaining({ lastSyncedAt: expect.any(Date) }),
      })
    )
  })
})

describe("syncRepository", () => {
  it("returns early when repo is not stale (synced recently)", async () => {
    // lastSyncedAt = 1 second ago → not stale
    mockLimit.mockResolvedValue([{ lastSyncedAt: new Date(Date.now() - 1000) }])
    await syncRepository("myrepo")
    expect(mockListTags).not.toHaveBeenCalled()
    expect(mockSelect).toHaveBeenCalledWith(expect.objectContaining({ lastSyncedAt: expect.anything() }))
  })

  it("syncs when lastSyncedAt is null (missing entry)", async () => {
    mockLimit.mockResolvedValue([{ lastSyncedAt: null }])
    mockListTags.mockResolvedValue([])
    await syncRepository("myrepo")
    expect(mockListTags).toHaveBeenCalledWith("myrepo")
  })

  it("syncs when no repo entry exists in DB", async () => {
    mockLimit.mockResolvedValue([])
    mockListTags.mockResolvedValue([])
    await syncRepository("myrepo")
    expect(mockListTags).toHaveBeenCalledWith("myrepo")
  })

  it("syncs when lastSyncedAt is older than 5 minutes", async () => {
    mockLimit.mockResolvedValue([{ lastSyncedAt: new Date(Date.now() - 10 * 60 * 1000) }])
    mockListTags.mockResolvedValue([])
    await syncRepository("myrepo")
    expect(mockListTags).toHaveBeenCalledWith("myrepo")
  })

  it("upserts repository with tagCount=0 when no tags", async () => {
    mockLimit.mockResolvedValue([])
    mockListTags.mockResolvedValue([])
    await syncRepository("myrepo")
    // Should call insert for repository upsert at the end
    expect(mockInsert).toHaveBeenCalled()
    const lastCall = (mockValues as any).mock.calls[(mockValues as any).mock.calls.length - 1][0] as any
    expect(lastCall).toMatchObject({ name: "myrepo", tagCount: 0, sizeBytes: 0 })
    
    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: "name",
        set: expect.objectContaining({
          tagCount: 0,
          sizeBytes: 0,
          lastSyncedAt: expect.any(Date),
        })
      })
    )
  })

  it("skips imageMetadata upsert when no tags", async () => {
    mockLimit.mockResolvedValue([])
    mockListTags.mockResolvedValue([])
    await syncRepository("myrepo")
    // Only one insert call (for repository), not two
    expect(mockInsert).toHaveBeenCalledTimes(1)
  })

  it("upserts imageMetadata rows for ok manifests with layers", async () => {
    mockLimit.mockResolvedValue([])
    mockListTags.mockResolvedValue(["latest"])
    mockGetJsonBlob.mockResolvedValue({
      os: "linux",
      architecture: "amd64",
      created: "2024-01-01T00:00:00.000Z",
      config: { Labels: { "org.opencontainers.image.description": "d" } },
    })
    mockGetManifest.mockResolvedValue({
      ok: true,
      headers: mockManifestHeaders(),
      json: async () => ({
        schemaVersion: 2,
        mediaType: "application/vnd.docker.distribution.manifest.v2+json",
        layers: [{ size: 100 }, { size: 200 }],
        config: { mediaType: "application/vnd.docker.container.image.v1+json", size: 1, digest: "sha256:configblob" },
      }),
    })
    await syncRepository("myrepo")
    expect(mockGetJsonBlob).toHaveBeenCalled()
    expect(mockInsert).toHaveBeenCalledTimes(2) // imageMetadata + repository
    const metaCall = (mockValues as any).mock.calls[0][0] as any
    expect(metaCall[0]).toMatchObject({
      repository: "myrepo",
      tag: "latest",
      totalSize: 300,
      os: "linux",
      architecture: "amd64",
      labels: { "org.opencontainers.image.description": "d" },
    })
    const repoCall = (mockValues as any).mock.calls[1][0] as any
    expect(repoCall).toMatchObject({ name: "myrepo", tagCount: 1, sizeBytes: 300 })
    
    // Verify onConflictDoUpdate for imageMetadata
    expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: ["repository", "tag"],
        set: expect.objectContaining({
          digest: expect.anything(),
          totalSize: expect.anything(),
          os: expect.anything(),
          architecture: expect.anything(),
          createdAt: expect.anything(),
          lastSyncedAt: expect.anything(),
        })
      })
    )
    
    const updateCall = mockOnConflictDoUpdate.mock.calls[0][0]
    const setStr = JSON.stringify(updateCall.set)
    expect(setStr).toContain("excluded.digest")
    expect(setStr).toContain("excluded.total_size")
    expect(setStr).toContain("excluded.os")
    expect(setStr).toContain("excluded.architecture")
    expect(setStr).toContain("excluded.created_at")
    expect(setStr).toContain("excluded.labels")
    expect(setStr).toContain("excluded.last_synced_at")
  })

  it("uses fsLayers when layers absent", async () => {
    mockLimit.mockResolvedValue([])
    mockListTags.mockResolvedValue(["v1"])
    mockGetManifest.mockResolvedValue({
      ok: true,
      headers: mockManifestHeaders(),
      json: async () => ({
        mediaType: "application/vnd.docker.distribution.manifest.v2+json",
        fsLayers: [{ size: 50 }, { size: 75 }],
        config: { mediaType: "application/vnd.docker.container.image.v1+json", digest: "sha256:xyz" },
      }),
    })
    await syncRepository("myrepo")
    const metaCall = (mockValues as any).mock.calls[0][0] as any
    expect(metaCall[0]).toMatchObject({ totalSize: 125 })
  })

  it("skips tags with non-ok manifest responses", async () => {
    mockLimit.mockResolvedValue([])
    mockListTags.mockResolvedValue(["bad-tag"])
    mockGetManifest.mockResolvedValue({ ok: false, json: async () => ({}) })
    await syncRepository("myrepo")
    // Only repository upsert, no imageMetadata upsert
    expect(mockInsert).toHaveBeenCalledTimes(1)
  })

  it("skips rejected promise results from allSettled", async () => {
    mockLimit.mockResolvedValue([])
    mockListTags.mockResolvedValue(["err-tag"])
    const allSettledSpy = vi.spyOn(Promise, "allSettled").mockResolvedValueOnce([{ status: "rejected", reason: "err" }])
    await syncRepository("myrepo")
    expect(mockInsert).toHaveBeenCalledTimes(1) // only repository upsert
    allSettledSpy.mockRestore()
  })

  it("skips rejected promise results from allSettled (empty status)", async () => {
    mockLimit.mockResolvedValue([])
    mockListTags.mockResolvedValue(["err-tag"])
    // simulate a promise that settles with empty status
    const allSettledSpy = vi.spyOn(Promise, "allSettled").mockResolvedValueOnce([{ status: "" as any, reason: "err" }])
    await syncRepository("myrepo")
    expect(mockInsert).toHaveBeenCalledTimes(1) // only repository upsert
    allSettledSpy.mockRestore()
  })

  it("skips rejected promise results from allSettled (false status)", async () => {
    mockLimit.mockResolvedValue([])
    mockListTags.mockResolvedValue(["err-tag"])
    const allSettledSpy = vi.spyOn(Promise, "allSettled").mockResolvedValueOnce([{ status: false as any, reason: "err" }])
    await syncRepository("myrepo")
    expect(mockInsert).toHaveBeenCalledTimes(1) // only repository upsert
    allSettledSpy.mockRestore()
  })

  it("skips null promise results from allSettled", async () => {
    mockLimit.mockResolvedValue([])
    mockListTags.mockResolvedValue(["null-tag"])
    mockGetManifest.mockResolvedValue({ ok: false })
    await syncRepository("myrepo")
    expect(mockInsert).toHaveBeenCalledTimes(1) // only repository upsert
  })

  it("handles manifest with null config fields", async () => {
    mockLimit.mockResolvedValue([])
    mockListTags.mockResolvedValue(["minimal"])
    mockGetManifest.mockResolvedValue({
      ok: true,
      headers: mockManifestHeaders(),
      json: async () => ({
        schemaVersion: 2,
        layers: [],
        config: {},
      }),
    })
    await syncRepository("myrepo")
    const metaCall = (mockValues as any).mock.calls[0][0] as any
    expect(metaCall[0]).toMatchObject({ os: null, architecture: null, createdAt: null })
  })

  it("handles manifest with missing config object", async () => {
    mockLimit.mockResolvedValue([])
    mockListTags.mockResolvedValue(["noconfig"])
    mockGetManifest.mockResolvedValue({
      ok: true,
      headers: mockManifestHeaders(),
      json: async () => ({
        schemaVersion: 2,
        layers: [],
      }),
    })
    await syncRepository("myrepo")
    const metaCall = (mockValues as any).mock.calls[0][0] as any
    expect(metaCall[0]).toMatchObject({ os: null, architecture: null, createdAt: null, digest: "sha256:manifestlayer" })
  })

  it("handles manifest with neither layers nor fsLayers", async () => {
    mockLimit.mockResolvedValue([])
    mockListTags.mockResolvedValue(["empty"])
    mockGetManifest.mockResolvedValue({
      ok: true,
      headers: mockManifestHeaders(),
      json: async () => ({
        // no layers, no fsLayers
        config: { digest: "sha256:abc" },
      }),
    })
    await syncRepository("myrepo")
    const metaCall = (mockValues as any).mock.calls[0][0] as any
    expect(metaCall[0]).toMatchObject({ totalSize: 0 })
  })

  it("uses 0 for layer size when size field is absent", async () => {
    mockLimit.mockResolvedValue([])
    mockListTags.mockResolvedValue(["notag"])
    mockGetManifest.mockResolvedValue({
      ok: true,
      headers: mockManifestHeaders(),
      json: async () => ({
        mediaType: "application/vnd.docker.distribution.manifest.v2+json",
        layers: [{}], // no size field
        config: { mediaType: "application/vnd.docker.container.image.v1+json", digest: "sha256:abc" },
      }),
    })
    await syncRepository("myrepo")
    const metaCall = (mockValues as any).mock.calls[0][0] as any
    expect(metaCall[0]).toMatchObject({ totalSize: 0 })
  })

  it("processes tags in batches (more than 8 tags)", async () => {
    mockLimit.mockResolvedValue([])
    const tags = Array.from({ length: 10 }, (_, i) => `tag${i}`)
    mockListTags.mockResolvedValue(tags)
    mockGetManifest.mockResolvedValue({
      ok: true,
      headers: mockManifestHeaders(),
      json: async () => ({
        mediaType: "application/vnd.docker.distribution.manifest.v2+json",
        layers: [],
        config: { digest: "sha256:abc" },
      }),
    })
    const allSettledSpy = vi.spyOn(Promise, "allSettled")
    await syncRepository("myrepo")
    expect(mockGetManifest).toHaveBeenCalledTimes(10)
    expect(allSettledSpy).toHaveBeenCalledTimes(2) // 10 tags / 8 = 2 batches
    allSettledSpy.mockRestore()
  })
})

describe("syncAll", () => {
  it("calls syncRepository for each repo from registry", async () => {
    // First call (in syncAll) → listRepositories
    // syncAll calls listRepositories once, then syncRepository for each
    // syncRepository calls db.select for stale check
    mockListRepositories.mockResolvedValue(["r1", "r2"])
    // Make repos appear recently synced so syncRepository exits early
    mockLimit.mockResolvedValue([{ lastSyncedAt: new Date(Date.now() - 1000) }])
    await syncAll()
    expect(mockListRepositories).toHaveBeenCalledTimes(1)
    // syncRepository was called for r1 and r2, each called db.select
    expect(mockSelect).toHaveBeenCalledTimes(2)
  })

  it("does nothing when registry empty", async () => {
    mockListRepositories.mockResolvedValue([])
    await syncAll()
    expect(mockSelect).not.toHaveBeenCalled()
  })
})
