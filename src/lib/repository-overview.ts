import { marked } from "marked"
import DOMPurify from "isomorphic-dompurify"

export type OverviewTagRow = {
  tag: string
  lastSyncedAt: Date
  labels: Record<string, string> | null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;")
}

/**
 * Prefer `latest` with labels, else the most recently synced row that has OCI labels.
 */
export function pickTagRowForOverview(rows: OverviewTagRow[]): OverviewTagRow | null {
  if (rows.length === 0) return null
  const hasLabels = (r: OverviewTagRow) => r.labels && Object.keys(r.labels).length > 0
  const latest = rows.find((r) => r.tag === "latest")
  if (latest && hasLabels(latest)) return latest
  const withLabels = rows.filter(hasLabels)
  if (withLabels.length === 0) {
    const latestAny = rows.find((r) => r.tag === "latest")
    return latestAny ?? rows[0] ?? null
  }
  withLabels.sort((a, b) => b.lastSyncedAt.getTime() - a.lastSyncedAt.getTime())
  return withLabels[0] ?? null
}

const LABEL_TITLE = "org.opencontainers.image.title"
const LABEL_DESC = "org.opencontainers.image.description"
const LABEL_URL = "org.opencontainers.image.url"
const LABEL_SOURCE = "org.opencontainers.image.source"
const LABEL_DOCS = "org.opencontainers.image.documentation"

export function renderOverviewFromLabels(labels: Record<string, string>): string {
  const title = labels[LABEL_TITLE]?.trim() ?? ""
  const desc = labels[LABEL_DESC]?.trim() ?? ""
  const url = labels[LABEL_URL]?.trim()
  const source = labels[LABEL_SOURCE]?.trim()
  const doc = labels[LABEL_DOCS]?.trim()

  const parts: string[] = []
  if (title) parts.push(`<h2 class="text-lg font-semibold tracking-tight">${escapeHtml(title)}</h2>`)
  if (desc) parts.push(`<p class="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap mt-2">${escapeHtml(desc)}</p>`)

  const links: { label: string; href: string }[] = []
  if (url) links.push({ label: "Website", href: url })
  if (source) links.push({ label: "Source", href: source })
  if (doc) links.push({ label: "Documentation", href: doc })
  if (links.length) {
    parts.push('<ul class="list-disc pl-5 text-sm mt-3 space-y-1">')
    for (const { label, href } of links) {
      parts.push(
        `<li><a class="text-primary underline underline-offset-2 hover:opacity-90" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
          label,
        )}</a></li>`,
      )
    }
    parts.push("</ul>")
  }

  const raw = parts.join("")
  return DOMPurify.sanitize(raw, { ADD_ATTR: ["target", "rel", "class"] })
}

export function renderMarkdownToSafeHtml(markdown: string): string {
  const raw = marked.parse(markdown, { async: false }) as string
  return DOMPurify.sanitize(raw, { ADD_ATTR: ["class", "id", "target", "rel", "href"] })
}

export type RepositoryOverviewResult = {
  html: string
  source: "db" | "labels" | "empty"
}

export function buildRepositoryOverview(args: {
  overviewMarkdown: string | null | undefined
  tagRows: OverviewTagRow[]
}): RepositoryOverviewResult {
  const md = args.overviewMarkdown?.trim()
  if (md) {
    return { html: renderMarkdownToSafeHtml(md), source: "db" }
  }
  const picked = pickTagRowForOverview(args.tagRows)
  const labels = picked?.labels
  if (labels && Object.keys(labels).length > 0) {
    const labelHtml = renderOverviewFromLabels(labels)
    if (labelHtml.trim().length > 0) return { html: labelHtml, source: "labels" }
  }
  return { html: "", source: "empty" }
}
