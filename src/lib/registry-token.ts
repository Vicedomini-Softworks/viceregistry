import { SignJWT, importPKCS8 } from "jose"

export interface TokenClaims {
  subject: string
  service: string
  scope: string
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

export function computeGrantedScope(requestedScope: string, roleNames: string[]): string {
  if (!requestedScope) return ""
  const parts = requestedScope.split(":")
  if (parts.length < 3) return ""
  const [type, name, actionsStr] = parts
  const requestedActions = actionsStr.split(",").filter(Boolean)

  const isAdmin = roleNames.includes("admin")
  const canPush = isAdmin || roleNames.includes("push")
  const canPull = canPush || roleNames.includes("viewer")

  const granted = requestedActions.filter((a) => {
    if (a === "pull") return canPull
    if (a === "push") return canPush
    if (a === "*" || a === "delete") return isAdmin
    return false
  })

  if (granted.length === 0) return ""
  return `${type}:${name}:${granted.join(",")}`
}
