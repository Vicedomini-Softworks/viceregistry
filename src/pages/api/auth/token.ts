import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import {
  users,
  userRoles,
  roles,
  accessTokens,
  repositories,
  userRepositoryPermissions,
  organizations,
  organizationRepositories,
} from "@/lib/schema"
import { issueRegistryToken, computeGrantedScope } from "@/lib/registry-token"
import { eq, and } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { writeAuditLog } from "@/lib/audit"

function parseRepositoryNameFromScope(scope: string): string | null {
  const parts = scope.split(":")
  if (parts.length < 3) return null
  const [type, name] = parts
  if (type !== "repository" || !name) return null
  return name
}

function hasPushInScope(scope: string): boolean {
  const parts = scope.split(":")
  if (parts.length < 3) return false
  const actions = parts[2]?.split(",") ?? []
  return actions.includes("push")
}

function hasPullInScope(scope: string): boolean {
  const parts = scope.split(":")
  if (parts.length < 3) return false
  const actions = parts[2]?.split(",") ?? []
  return actions.includes("pull")
}

async function assignRepositoryOwner(repositoryName: string, userId: string, username: string) {
  // Ensure repository exists and stays private by default unless changed manually.
  await db
    .insert(repositories)
    .values({
      name: repositoryName,
      visibility: "private",
      lastSyncedAt: new Date(),
    })
    .onConflictDoNothing({ target: repositories.name })

  const slashIdx = repositoryName.indexOf("/")
  const namespace = slashIdx > 0 ? repositoryName.slice(0, slashIdx) : null

  if (namespace) {
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, namespace))
      .limit(1)

    if (org) {
      await db
        .insert(organizationRepositories)
        .values({
          organizationId: org.id,
          repositoryName,
        })
        .onConflictDoNothing({
          target: [organizationRepositories.organizationId, organizationRepositories.repositoryName],
        })
      return
    }
  }

  const [ownerUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.username, username)))
    .limit(1)
  if (!ownerUser) return

  await db
    .insert(userRepositoryPermissions)
    .values({
      userId: ownerUser.id,
      repositoryName,
      permission: "admin",
    })
    .onConflictDoUpdate({
      target: [userRepositoryPermissions.userId, userRepositoryPermissions.repositoryName],
      set: { permission: "admin" },
    })
}

function getClientIp(request: Request): string | null {
  return (
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    request.headers.get("X-Real-IP") ??
    null
  )
}

async function handleTokenRequest(
  username: string,
  password: string,
  service: string,
  scope: string,
  ipAddress: string | null,
): Promise<Response> {
  if (!username || !password) {
    if (process.env.DEBUG === "true") console.error("no username or password")
    writeAuditLog({
      userId: null,
      action: "token_request_failed",
      resource: "no_credentials",
      ipAddress,
    })
    return new Response(JSON.stringify({ errors: [{ code: "UNAUTHORIZED", message: "authentication required" }] }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1)

  if (!user || !user.isActive) {
    if (process.env.DEBUG === "true") {
      console.error("[AUTH] User lookup failed:", {
        username,
        userId: user?.id,
        isActive: user?.isActive,
        reason: user ? "inactive" : "not_found"
      })
    }
    writeAuditLog({
      userId: user?.id ?? null,
      action: "token_request_failed",
      resource: "user_not_found_or_inactive",
      ipAddress,
    })
    return new Response(JSON.stringify({ errors: [{ code: "UNAUTHORIZED", message: "invalid credentials" }] }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  let isAuthenticated = false
  let tokenConstraints: { organizationId?: string | null; repositoryName?: string | null } | undefined

  if (password.startsWith("vr_")) {
    if (process.env.DEBUG === "true") console.log("access token used")
    const tokens = await db.select().from(accessTokens).where(eq(accessTokens.userId, user.id))
    for (const t of tokens) {
      if (await bcrypt.compare(password, t.tokenHash)) {
        isAuthenticated = true
        tokenConstraints = { organizationId: t.organizationId, repositoryName: t.repositoryName }
        if (process.env.DEBUG === "true") console.log("access token found, constraints:", tokenConstraints)
        await db.update(accessTokens).set({ lastUsedAt: new Date() }).where(eq(accessTokens.id, t.id))
        break
      }
    }
  } else {
    if (process.env.DEBUG === "true") console.log("password used")
    isAuthenticated = await bcrypt.compare(password, user.passwordHash)
  }

  if (!isAuthenticated) {
    if (process.env.DEBUG === "true") {
      console.error("[AUTH] Password verification failed for user:", user.id)
    }
    writeAuditLog({
      userId: user.id,
      action: "token_request_failed",
      resource: "invalid_password",
      ipAddress,
    })
    return new Response(JSON.stringify({ errors: [{ code: "UNAUTHORIZED", message: "invalid credentials" }] }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const roleRows = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, user.id))
  const roleNames = roleRows.map((r) => r.name)

  const grantedScope = await computeGrantedScope(scope, roleNames, user.id, tokenConstraints)

  if (process.env.DEBUG === "true") {
    console.log("[AUTH] Scope computed:", {
      requested: scope,
      granted: grantedScope,
      roleNames,
      hasPush: hasPushInScope(grantedScope),
      hasPull: hasPullInScope(grantedScope),
      constraints: tokenConstraints
    })
  }

  if (hasPushInScope(grantedScope)) {
    if (process.env.DEBUG === "true") console.log("push scope found")
    const repositoryName = parseRepositoryNameFromScope(grantedScope)
    if (repositoryName) {
      if (process.env.DEBUG === "true") console.log("repository name:", repositoryName)
      await assignRepositoryOwner(repositoryName, user.id, user.username)
    }
  }

  const token = await issueRegistryToken({ subject: username, service, scope: grantedScope })

  writeAuditLog({
    userId: user.id,
    action: "token_issued",
    resource: scope || "*",
    ipAddress,
  })

  return Response.json({
    token,
    access_token: token,
    issued_at: new Date().toISOString(),
    expires_in: 300,
  })
}

export const GET: APIRoute = async ({ request, url }) => {
  const service = url.searchParams.get("service") ?? ""
  const scope = url.searchParams.get("scope") ?? ""
  const ipAddress = getClientIp(request)

  const authHeader = request.headers.get("Authorization") ?? ""
  const base64 = authHeader.replace(/^Basic\s+/i, "")

  let username = ""
  let password = ""

  if (process.env.DEBUG === "true") {
    console.log("[AUTH] Token request:", {
      method: "GET",
      service,
      scope,
      ipAddress,
    })
  }

  try {
    const decoded = atob(base64)
    const colonIdx = decoded.indexOf(":")
    if (colonIdx === -1) throw new Error("no colon")
    username = decoded.slice(0, colonIdx)
    password = decoded.slice(colonIdx + 1)
  } catch {
    console.error("error decoding basic auth")
    writeAuditLog({
      userId: null,
      action: "token_request_failed",
      resource: "basic_auth_decode_error",
      ipAddress,
    })
    return new Response(JSON.stringify({ errors: [{ code: "UNAUTHORIZED", message: "authentication required" }] }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer realm="${process.env.PUBLIC_URL}/api/auth/token",service="${service}"`,
      },
    })
  }

  return handleTokenRequest(username, password, service, scope, ipAddress)
}

export const POST: APIRoute = async ({ request }) => {
  let body: URLSearchParams
  try {
    const text = await request.text()
    body = new URLSearchParams(text)
  } catch {
    return new Response(JSON.stringify({ errors: [{ code: "UNAUTHORIZED", message: "invalid request body" }] }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const grantType = body.get("grant_type")
  const service = body.get("service") ?? ""
  const scope = body.get("scope") ?? ""
  const username = body.get("username") ?? ""
  const password = body.get("password") ?? ""
  const ipAddress = getClientIp(request)

  if (process.env.DEBUG === "true") console.log("POST token request, grant_type:", grantType, "scope:", scope)

  if (grantType !== "password") {
    return new Response(JSON.stringify({ errors: [{ code: "UNSUPPORTED_GRANT_TYPE", message: "only password grant supported" }] }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  return handleTokenRequest(username, password, service, scope, ipAddress)
}
