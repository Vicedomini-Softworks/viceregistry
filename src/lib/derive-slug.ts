/**
 * Turn a display name into a URL/docker-safe slug: lowercase ASCII
 * a–z, 0–9, single hyphens between word segments, max 39 chars.
 * Uses Unicode normalization so Latin letters with accents/diacritics
 * map to base letters (e.g. École → ecole) instead of being stripped.
 */
export function deriveSlug(name: string): string {
  return name
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 39)
}
