import { SignJWT, importPKCS8 } from "jose"
import { db } from "@/lib/db"
import { organizationRepositories, organizationMembers, userRepositoryPermissions } from "@/lib/schema"
import { eq, and, or } from "drizzle-orm"

export interface TokenClaims {
  subject: string
  service: string
  scope: string
}

export interface TokenConstraints {
  organizationId?: string | null
  repositoryName?: string | null
}

export async function issueRegistryToken(claims: TokenClaims): Promise<string> {
  const rawKey = process.env.REGISTRY_TOKEN_PRIVATE_KEY
  if (!rawKey) throw new Error("REGISTRY_TOKEN_PRIVATE_KEY env var is required")
  const privateKeyPem = rawKey.replace(/\\n/g, "\n")
  const privateKey = await importPKCS8(privateKeyPem, "RS256")

  const access = parseScopeToAccess(claims.scope)

  return new SignJWT({ access, sub: claims.subject })
    .setProtectedHeader({ alg: "RS256" })
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
  const actions = actionsStr.split(",").filter(Boolean)
  return [{ type, name, actions }]
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
  const requestedActions = actionsStr.split(",").filter(Boolean)

  // 1. Check Token Constraints first
  if (constraints) {
    if (constraints.repositoryName && constraints.repositoryName !== name) {
      return "" // Token is scoped to a different repository
    }
    // Organization constraint will be checked during permission resolution
  }

  let isAdmin = roleNames.includes("admin")
  let canPush = isAdmin || roleNames.includes("push")
  let canPull = canPush || roleNames.includes("viewer")

  if (userId && type === "repository") {
    // 2. Check Organization-level access
    const orgAccess = await db
      .select({ role: organizationMembers.role, orgId: organizationMembers.organizationId })
      .from(organizationRepositories)
      .innerJoin(organizationMembers, eq(organizationRepositories.organizationId, organizationMembers.organizationId))
      .where(and(eq(organizationRepositories.repositoryName, name), eq(organizationMembers.userId, userId)))
      .limit(1)

    if (orgAccess.length > 0) {
      const { role: oRole, orgId } = orgAccess[0]
      
      // If token is constrained to an org, ensure it matches
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

    // 3. Check Direct Repository-level access (User-specific)
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

  const granted = requestedActions.filter((a) => {
    if (a === "pull") return canPull
    if (a === "push") return canPush
    if (a === "*" || a === "delete") return isAdmin
    return false
  })

  if (granted.length === 0) return ""
  return `${type}:${name}:${granted.join(",")}`
}
