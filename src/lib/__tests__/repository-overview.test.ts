import { describe, it, expect } from "vitest"
import {
  pickTagRowForOverview,
  buildRepositoryOverview,
  renderOverviewFromLabels,
} from "@/lib/repository-overview"

const d = (s: string) => new Date(s)

describe("pickTagRowForOverview", () => {
  it("prefers latest when it has labels", () => {
    const rows: import("@/lib/repository-overview").OverviewTagRow[] = [
      { tag: "v1", lastSyncedAt: d("2024-02-01"), labels: { a: "1" } },
      { tag: "latest", lastSyncedAt: d("2024-01-01"), labels: { b: "2" } },
    ]
    expect(pickTagRowForOverview(rows)?.tag).toBe("latest")
  })

  it("uses most recent tag with labels when latest has none", () => {
    const rows = [
      { tag: "v1", lastSyncedAt: d("2024-02-01"), labels: { "org.opencontainers.image.title": "T" } },
      { tag: "latest", lastSyncedAt: d("2024-03-01"), labels: null },
    ]
    expect(pickTagRowForOverview(rows)?.tag).toBe("v1")
  })

  it("falls back to latest without labels if no labels anywhere", () => {
    const rows = [
      { tag: "v1", lastSyncedAt: d("2024-02-01"), labels: null },
      { tag: "latest", lastSyncedAt: d("2024-03-01"), labels: null },
    ]
    expect(pickTagRowForOverview(rows)?.tag).toBe("latest")
  })
})

describe("buildRepositoryOverview", () => {
  it("uses DB markdown over labels", () => {
    const r = buildRepositoryOverview({
      overviewMarkdown: "# Hi",
      tagRows: [
        { tag: "latest", lastSyncedAt: d("2024-01-01"), labels: { "org.opencontainers.image.description": "L" } },
      ],
    })
    expect(r.source).toBe("db")
    expect(r.html).toContain("Hi")
    expect(r.html).not.toContain("L")
  })

  it("uses labels when no markdown", () => {
    const r = buildRepositoryOverview({
      overviewMarkdown: null,
      tagRows: [
        { tag: "latest", lastSyncedAt: d("2024-01-01"), labels: { "org.opencontainers.image.description": "From labels" } },
      ],
    })
    expect(r.source).toBe("labels")
    expect(r.html).toContain("From labels")
  })
})

describe("renderOverviewFromLabels", () => {
  it("includes title and link tags", () => {
    const html = renderOverviewFromLabels({
      "org.opencontainers.image.title": "My app",
      "org.opencontainers.image.url": "https://example.com",
    })
    expect(html).toContain("My app")
    expect(html).toContain("https://example.com")
  })
})
