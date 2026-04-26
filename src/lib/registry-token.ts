import { SignJWT, importPKCS8 } from "jose"
import { createPrivateKey, createPublicKey, createHash } from "crypto"
import { db } from "@/lib/db"
import { organizations, organizationRepositories, organizationMembers, userRepositoryPermissions, users } from "@/lib/schema"
import { eq, and } from "drizzle-orm"

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

function base32Encode(buf: Buffer): string {
  let result = ""
  let bits = 0
  let value = 0
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      result += BASE32[(value >>> bits) & 0x1f]
    }
  }
  if (bits > 0) result += BASE32[(value << (5 - bits)) & 0x1f]
  return result
}

function computeKeyId(privateKeyPem: string): string {
  const der = createPublicKey(createPrivateKey(privateKeyPem)).export({ type: "spki", format: "der" }) as Buffer
  const hash = createHash("sha256").update(der).digest()
  return base32Encode(hash.subarray(0, 30)).slice(0, 48).match(/.{4}/g)!.join(":")
}

export interface TokenClaims {
  subject: string
  service: string
  scope: string
}

export interface TokenConstraints {
  organizationId?: string | null
  repositoryName?: string | null
}

/** Splits a ":" scope action list and omits empty segments. Exported for unit tests. */
export function splitCommaScopeActions(actionsStr: string): string[] {
  return actionsStr.split(",").filter((a) => a.length > 0)
}

export async function issueRegistryToken(claims: TokenClaims): Promise<string> {
  const rawKey = process.env.REGISTRY_TOKEN_PRIVATE_KEY
  if (!rawKey) throw new Error("REGISTRY_TOKEN_PRIVATE_KEY env var is required")
  // Stryker disable next-line StringLiteral: PEM line breaks are real newlines (0x0a), not empty
  const privateKeyPem = rawKey.replace(/\\n/g, "\n")
  const privateKey = await importPKCS8(privateKeyPem, "RS256")

  const access = parseScopeToAccess(claims.scope)

  const kid = computeKeyId(privateKeyPem)

  return new SignJWT({ access, sub: claims.subject })
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuedAt()
    .setExpirationTime("5m")
    .setAudience(claims.service)
    .setIssuer(process.env.REGISTRY_TOKEN_ISSUER ?? "viceregistry")
    .sign(privateKey)
}

function parseScopeToAccess(scope: string) {
  const parts = scope.split(":")
  if (parts.length < 3) return []
  const [type, name, actionsStr] = parts
  const actions = splitCommaScopeActions(actionsStr)
  return [{ type, name, actions }]
}

function parseNamespace(name: string): string | null {
  const slashIdx = name.indexOf("/")
  if (slashIdx === -1) return null
  return name.slice(0, slashIdx)
}

export async function computeGrantedScope(
  requestedScope: string,
  roleNames: string[],
  userId?: string,
  constraints?: TokenConstraints
): Promise<string> {
  if (!requestedScope) return ""
  const parts = requestedScope.split(":")
  if (parts.length < 3) return ""
  const [type, name, actionsStr] = parts
  const requestedActions = splitCommaScopeActions(actionsStr)

  // 1. Check Token Constraints first
  if (constraints) {
    if (constraints.repositoryName && constraints.repositoryName !== name) {
      return ""
    }
  }

  let isAdmin = roleNames.includes("admin")
  let canPush = isAdmin || roleNames.includes("push")
  let canPull = canPush || roleNames.includes("viewer")

  if (userId && type === "repository") {
    if (isAdmin) {
      // Global admin bypasses all namespace checks
    } else {
      const namespace = parseNamespace(name)

      if (namespace !== null) {
        // Namespaced repository — resolve via username or org slug
        const [userRow] = await db
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)

        if (!userRow) return ""

        if (userRow.username !== namespace) {
          // Not the user's own namespace — check org membership by slug
          const orgAccess = await db
            .select({ role: organizationMembers.role, orgId: organizationMembers.organizationId })
            .from(organizations)
            .innerJoin(organizationMembers, eq(organizations.id, organizationMembers.organizationId))
            .where(and(eq(organizations.slug, namespace), eq(organizationMembers.userId, userId)))
            .limit(1)

          if (orgAccess.length === 0) return ""

          const { role: oRole, orgId } = orgAccess[0]

          if (constraints?.organizationId && constraints.organizationId !== orgId) return ""

          // Org role is authoritative — overwrite all global role flags
          if (
            oRole !== "owner" &&
            oRole !== "admin" &&
            oRole !== "developer" &&
            oRole !== "push" &&
            oRole !== "member" &&
            oRole !== "viewer" &&
            oRole !== "pull"
          ) {
            return ""
          }
          if (oRole === "owner" || oRole === "admin") {
            isAdmin = true
            canPush = true
            canPull = true
          } else if (oRole === "developer" || oRole === "push") {
            isAdmin = false
            canPush = true
            canPull = true
          } else {
            isAdmin = false
            canPush = false
            canPull = true
          }
        }
        // else: user's own namespace — global role flags already correct
      } else {
        // Flat name — existing org repo + direct permission checks (backward compat)
        const orgAccess = await db
          .select({ role: organizationMembers.role, orgId: organizationMembers.organizationId })
          .from(organizationRepositories)
          .innerJoin(organizationMembers, eq(organizationRepositories.organizationId, organizationMembers.organizationId))
          .where(and(eq(organizationRepositories.repositoryName, name), eq(organizationMembers.userId, userId)))
          .limit(1)

        if (orgAccess.length > 0) {
          const { role: oRole, orgId } = orgAccess[0]

          if (!constraints?.organizationId || constraints.organizationId === orgId) {
            if (oRole === "owner" || oRole === "admin") {
              isAdmin = true
              canPush = true
              canPull = true
            } else if (oRole === "developer" || oRole === "push") {
              canPush = true
              canPull = true
            } else if (oRole === "member" || oRole === "viewer" || oRole === "pull") {
              canPull = true
            }
          }
        }

        const directAccess = await db
          .select({ permission: userRepositoryPermissions.permission })
          .from(userRepositoryPermissions)
          .where(and(eq(userRepositoryPermissions.repositoryName, name), eq(userRepositoryPermissions.userId, userId)))
          .limit(1)

        if (directAccess.length > 0) {
          const { permission } = directAccess[0]
          if (permission === "admin") {
            isAdmin = true
            canPush = true
            canPull = true
          } else if (permission === "push") {
            canPush = true
            canPull = true
          } else if (permission === "pull") {
            canPull = true
          }
        }
      }
    }
  }

  const granted = requestedActions.filter((a) => {
    if (a === "pull") return canPull
    if (a === "push") return canPush
    if (a === "*" || a === "delete") return isAdmin
    return false
  })

  if (granted.length === 0) return ""
  return `${type}:${name}:${granted.join(",")}`
}
