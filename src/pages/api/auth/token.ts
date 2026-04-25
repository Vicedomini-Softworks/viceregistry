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

export const GET: APIRoute = async ({ request, url }) => {
  const service = url.searchParams.get("service") ?? ""
  const scope = url.searchParams.get("scope") ?? ""

  const authHeader = request.headers.get("Authorization") ?? ""
  const base64 = authHeader.replace(/^Basic\s+/i, "")

  let username = ""
  let password = ""

  if (process.env.DEBUG === "true") {
    console.log(
      "username:", username,
      "scope required:", scope  
    );
  }

  try {
    const decoded = atob(base64)
    const colonIdx = decoded.indexOf(":")
    if (colonIdx === -1) throw new Error("no colon")
    username = decoded.slice(0, colonIdx)
    password = decoded.slice(colonIdx + 1)
  } catch {
    console.error("error decoding basic auth");
    return new Response(JSON.stringify({ errors: [{ code: "UNAUTHORIZED", message: "authentication required" }] }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer realm="${url.origin}/api/auth/token",service="${service}"`,
      },
    })
  }

  if (!username || !password) {
    if (process.env.DEBUG === "true") {
      console.error("no username or password");
    }
    return new Response(JSON.stringify({ errors: [{ code: "UNAUTHORIZED", message: "authentication required" }] }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1)

  if (!user || !user.isActive) {
    if (process.env.DEBUG === "true") {
      console.error("user not found or not active");
    }
    return new Response(JSON.stringify({ errors: [{ code: "UNAUTHORIZED", message: "invalid credentials" }] }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  let isAuthenticated = false
  let tokenConstraints: { organizationId?: string | null; repositoryName?: string | null } | undefined

  if (password.startsWith("vr_")) {
    if (process.env.DEBUG === "true") {
      console.log("access token used");
    }

    const tokens = await db.select().from(accessTokens).where(eq(accessTokens.userId, user.id))
    
    for (const t of tokens) {
      if (await bcrypt.compare(password, t.tokenHash)) {
        isAuthenticated = true
        tokenConstraints = {
          organizationId: t.organizationId,
          repositoryName: t.repositoryName,
        }
        if (process.env.DEBUG === "true") {
          console.log("token constraints:", tokenConstraints);
          console.log("access token found");
        }
        await db.update(accessTokens).set({ lastUsedAt: new Date() }).where(eq(accessTokens.id, t.id))
        if (process.env.DEBUG === "true") {
          console.log("access token updated");
        }
        break
      }
    }
  } else {
    if (process.env.DEBUG === "true") {
      console.log("password used");
    }
    isAuthenticated = await bcrypt.compare(password, user.passwordHash)
  }

  if (!isAuthenticated) {
    if (process.env.DEBUG === "true") {
      console.error("invalid credentials");
    }
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

  if (hasPushInScope(grantedScope)) {
    if (process.env.DEBUG === "true") {
      console.log("push scope found");
    }
    const repositoryName = parseRepositoryNameFromScope(grantedScope)
    if (repositoryName) {
      if (process.env.DEBUG === "true") {
        console.log("repository name:", repositoryName);
      }
      await assignRepositoryOwner(repositoryName, user.id, user.username)
      if (process.env.DEBUG === "true") {
        console.log("repository owner assigned");
      }
    }
  }

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
