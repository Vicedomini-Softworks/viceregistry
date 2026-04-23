import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { users, userRoles, roles, accessTokens } from "@/lib/schema"
import { issueRegistryToken, computeGrantedScope } from "@/lib/registry-token"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"

export const GET: APIRoute = async ({ request, url }) => {
  const service = url.searchParams.get("service") ?? ""
  const scope = url.searchParams.get("scope") ?? ""

  const authHeader = request.headers.get("Authorization") ?? ""
  const base64 = authHeader.replace(/^Basic\s+/i, "")

  let username = ""
  let password = ""
  try {
    const decoded = atob(base64)
    const colonIdx = decoded.indexOf(":")
    if (colonIdx === -1) throw new Error("no colon")
    username = decoded.slice(0, colonIdx)
    password = decoded.slice(colonIdx + 1)
  } catch {
    return new Response(JSON.stringify({ errors: [{ code: "UNAUTHORIZED", message: "authentication required" }] }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer realm="${url.origin}/api/auth/token",service="${service}"`,
      },
    })
  }

  if (!username || !password) {
    return new Response(JSON.stringify({ errors: [{ code: "UNAUTHORIZED", message: "authentication required" }] }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1)

  if (!user || !user.isActive) {
    return new Response(JSON.stringify({ errors: [{ code: "UNAUTHORIZED", message: "invalid credentials" }] }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  let isAuthenticated = false
  let tokenConstraints: { organizationId?: string | null; repositoryName?: string | null } | undefined

  if (password.startsWith("vr_")) {
    const tokens = await db.select().from(accessTokens).where(eq(accessTokens.userId, user.id))
    for (const t of tokens) {
      if (await bcrypt.compare(password, t.tokenHash)) {
        isAuthenticated = true
        tokenConstraints = {
          organizationId: t.organizationId,
          repositoryName: t.repositoryName,
        }
        await db.update(accessTokens).set({ lastUsedAt: new Date() }).where(eq(accessTokens.id, t.id))
        break
      }
    }
  } else {
    isAuthenticated = await bcrypt.compare(password, user.passwordHash)
  }

  if (!isAuthenticated) {
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

  const token = await issueRegistryToken({
    subject: username,
    service,
    scope: grantedScope,
  })

  return Response.json({
    token,
    issued_at: new Date().toISOString(),
    expires_in: 300,
  })
}
