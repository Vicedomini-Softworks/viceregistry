import { db } from "./db"
import { repositories } from "./schema"
import { computeGrantedScope } from "./registry-token"
import { eq } from "drizzle-orm"

/** Session user (or null when not signed in) for catalog / search RBAC */
export type BrowseUser = { sub: string; roles: string[] } | null

export async function canBrowseRepository(name: string, user: BrowseUser): Promise<boolean> {
  if (user?.roles.includes("admin")) return true

  const [row] = await db
    .select({ visibility: repositories.visibility })
    .from(repositories)
    .where(eq(repositories.name, name))
    .limit(1)

  if (!row) return false
  if (row.visibility === "public") return true
  if (!user) return false

  const granted = await computeGrantedScope(
    `repository:${name}:pull`,
    user.roles,
    user.sub,
  )
  return granted.length > 0
}

export async function filterByRepositoryAccess<T extends { name: string }>(
  rows: T[],
  user: BrowseUser,
): Promise<T[]> {
  const out: T[] = []
  for (const r of rows) {
    if (await canBrowseRepository(r.name, user)) out.push(r)
  }
  return out
}

export async function filterImageRowsByAccess<T extends { repository: string }>(
  rows: T[],
  user: BrowseUser,
): Promise<T[]> {
  const out: T[] = []
  for (const r of rows) {
    if (await canBrowseRepository(r.repository, user)) out.push(r)
  }
  return out
}
