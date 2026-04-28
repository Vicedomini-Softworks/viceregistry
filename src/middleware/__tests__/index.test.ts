import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockVerifySessionToken } = vi.hoisted(() => {
  const mockVerifySessionToken = vi.fn()
  return { mockVerifySessionToken }
})

vi.mock("astro:middleware", () => ({
  defineMiddleware: (fn: unknown) => fn,
}))

vi.mock("@/lib/auth", () => ({
  verifySessionToken: mockVerifySessionToken,
}))

import { onRequest } from "@/middleware/index"

function makeCtx(
  pathname: string,
  overrides: {
    method?: string
    sessionToken?: string
    sessionValid?: boolean
    user?: { roles: string[] } | null
  } = {},
) {
  const { method = "GET", sessionToken, sessionValid = true, user } = overrides

  const cookieGet = vi.fn().mockReturnValue(
    sessionToken ? { value: sessionToken } : undefined,
  )
  const cookieDelete = vi.fn()

  if (sessionToken && sessionValid) {
    mockVerifySessionToken.mockResolvedValueOnce(
      user ?? { sub: "u1", username: "alice", roles: [] },
    )
  } else if (sessionToken && !sessionValid) {
    mockVerifySessionToken.mockRejectedValueOnce(new Error("invalid"))
  }

  const ctx = {
    url: new URL(`http://localhost${pathname}`),
    cookies: { get: cookieGet, delete: cookieDelete },
    locals: {} as Record<string, unknown>,
    request: { method },
    redirect: vi.fn((url: string) => new Response(null, { status: 302, headers: { Location: url } })),
  }

  return { ctx, cookieDelete, cookieGet }
}

const next = vi.fn().mockResolvedValue(new Response("ok"))

beforeEach(() => {
  vi.clearAllMocks()
  next.mockResolvedValue(new Response("ok"))
})

describe("middleware", () => {
  describe("public routes", () => {
    it("calls next() with no session on /login", async () => {
      const { ctx } = makeCtx("/login")
      await (onRequest as Function)(ctx, next)
      expect(next).toHaveBeenCalled()
      expect(mockVerifySessionToken).not.toHaveBeenCalled()
    })

    it("calls next() with no session on /login (empty cookie)", async () => {
      const { ctx } = makeCtx("/login", { sessionToken: "" })
      await (onRequest as Function)(ctx, next)
      expect(next).toHaveBeenCalled()
    })

    it("attaches user from valid session on public route /dashboard", async () => {
      const { ctx, cookieGet } = makeCtx("/dashboard", {
        sessionToken: "valid.tok.en",
        user: { roles: ["viewer"] },
      })
      await (onRequest as Function)(ctx, next)
      expect(ctx.locals.user).toBeDefined()
      expect(next).toHaveBeenCalled()
      expect(cookieGet).toHaveBeenCalledWith("session")
    })

    it("clears cookie on invalid session token on public route", async () => {
      const { ctx, cookieDelete } = makeCtx("/dashboard", {
        sessionToken: "bad.tok.en",
        sessionValid: false,
      })
      await (onRequest as Function)(ctx, next)
      expect(cookieDelete).toHaveBeenCalledWith("session", { path: "/" })
      expect(next).toHaveBeenCalled()
    })

    it("allows /api/search without auth", async () => {
      const { ctx } = makeCtx("/api/search")
      await (onRequest as Function)(ctx, next)
      expect(next).toHaveBeenCalled()
    })

    it("allows /api/health without auth", async () => {
      const { ctx } = makeCtx("/api/health")
      await (onRequest as Function)(ctx, next)
      expect(next).toHaveBeenCalled()
    })

    it("allows /api/auth/token without auth", async () => {
      const { ctx } = makeCtx("/api/auth/token")
      await (onRequest as Function)(ctx, next)
      expect(next).toHaveBeenCalled()
    })

    it("allows passkey auth options without session", async () => {
      const { ctx } = makeCtx("/api/auth/webauthn/generate-authentication-options")
      await (onRequest as Function)(ctx, next)
      expect(next).toHaveBeenCalled()
    })

    it("allows passkey verify without session", async () => {
      const { ctx } = makeCtx("/api/auth/webauthn/verify-authentication")
      await (onRequest as Function)(ctx, next)
      expect(next).toHaveBeenCalled()
    })

    it("allows sub-paths of public routes", async () => {
      const { ctx } = makeCtx("/repository/myrepo")
      await (onRequest as Function)(ctx, next)
      expect(next).toHaveBeenCalled()
    })

    it("allows /r/ namespace-style repo paths without auth", async () => {
      const { ctx } = makeCtx("/r/owner/app")
      await (onRequest as Function)(ctx, next)
      expect(next).toHaveBeenCalled()
    })

    it("does not treat prefix matches without slash as public", async () => {
      const { ctx } = makeCtx("/login-fake")
      await (onRequest as Function)(ctx, next)
      expect(next).not.toHaveBeenCalled()
      expect(ctx.redirect).toHaveBeenCalledWith("/login")
    })
  })

  describe("unauthenticated access to protected routes", () => {
    it("returns 401 JSON for unauthenticated API request", async () => {
      const { ctx } = makeCtx("/api/auth/me")
      const res = await (onRequest as Function)(ctx, next)
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error).toBe("Unauthorized")
      expect(res.headers.get("Content-Type")).toBe("application/json")
    })

    it("redirects to /login for unauthenticated page request", async () => {
      const { ctx } = makeCtx("/settings")
      const res = await (onRequest as Function)(ctx, next)
      expect(ctx.redirect).toHaveBeenCalledWith("/login")
    })
  })

  describe("DELETE /api/registry/*", () => {
    it("returns 401 when no user", async () => {
      const { ctx } = makeCtx("/api/registry/myrepo/manifests/sha256:abc", { method: "DELETE" })
      const res = await (onRequest as Function)(ctx, next)
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error).toBe("Forbidden")
      expect(res.headers.get("Content-Type")).toBe("application/json")
    })

    it("returns 403 for DELETE /api/registry when user has no roles (optional chaining on roles)", async () => {
      const { ctx } = makeCtx("/api/registry/myrepo/manifests/x", {
        method: "DELETE",
        sessionToken: "tok",
        user: { sub: "u1" } as unknown as { roles: string[] },
      })
      const res = await (onRequest as Function)(ctx, next)
      expect(res.status).toBe(403)
    })

    it("returns 403 when non-admin user", async () => {
      const { ctx } = makeCtx("/api/registry/myrepo/manifests/sha256:abc", {
        method: "DELETE",
        sessionToken: "tok",
        user: { roles: ["viewer"] },
      })
      const res = await (onRequest as Function)(ctx, next)
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error).toBe("Forbidden")
      expect(res.headers.get("Content-Type")).toBe("application/json")
    })

    it("calls next() when admin user", async () => {
      const { ctx } = makeCtx("/api/registry/myrepo/manifests/sha256:abc", {
        method: "DELETE",
        sessionToken: "tok",
        user: { roles: ["admin"] },
      })
      await (onRequest as Function)(ctx, next)
      expect(next).toHaveBeenCalled()
    })

    it("does not trigger for GET /api/registry/*", async () => {
      const { ctx } = makeCtx("/api/registry/myrepo/manifests/sha256:abc", { method: "GET" })
      const res = await (onRequest as Function)(ctx, next)
      expect(res.status).toBe(401) // hits unauthenticated API request block
      const body = await res.json()
      expect(body.error).toBe("Unauthorized")
    })
  })

  describe("admin-only routes", () => {
    it("returns 403 JSON for non-admin on /api/users", async () => {
      const { ctx } = makeCtx("/api/users", {
        sessionToken: "tok",
        user: { roles: ["viewer"] },
      })
      const res = await (onRequest as Function)(ctx, next)
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error).toBe("Forbidden")
      expect(res.headers.get("Content-Type")).toBe("application/json")
    })

    it("returns 403 JSON for user without roles on /api/users (no throw from roles check)", async () => {
      const { ctx } = makeCtx("/api/users", {
        sessionToken: "tok",
        user: { sub: "u1" } as unknown as { roles: string[] },
      })
      const res = await (onRequest as Function)(ctx, next)
      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.error).toBe("Forbidden")
    })

    it("redirects non-admin to /dashboard for /admin page", async () => {
      const { ctx } = makeCtx("/admin/settings", {
        sessionToken: "tok",
        user: { roles: ["viewer"] },
      })
      const res = await (onRequest as Function)(ctx, next)
      expect(ctx.redirect).toHaveBeenCalledWith("/dashboard")
    })

    it("calls next() for admin on /admin route", async () => {
      const { ctx } = makeCtx("/admin/users", {
        sessionToken: "tok",
        user: { roles: ["admin"] },
      })
      await (onRequest as Function)(ctx, next)
      expect(next).toHaveBeenCalled()
    })

    it("calls next() for admin on /api/users", async () => {
      const { ctx } = makeCtx("/api/users/123", {
        sessionToken: "tok",
        user: { roles: ["admin"] },
      })
      await (onRequest as Function)(ctx, next)
      expect(next).toHaveBeenCalled()
    })

    it("does not treat prefix matches without slash as admin", async () => {
      const { ctx } = makeCtx("/admin-fake", {
        sessionToken: "tok",
        user: { roles: ["viewer"] },
      })
      await (onRequest as Function)(ctx, next)
      expect(next).toHaveBeenCalled()
    })
  })

  describe("auth-required non-admin routes", () => {
    it("DELETE /settings with session does not use registry delete admin block", async () => {
      const { ctx } = makeCtx("/settings", {
        method: "DELETE",
        sessionToken: "tok",
        user: { roles: ["viewer"] },
      })
      await (onRequest as Function)(ctx, next)
      expect(next).toHaveBeenCalled()
    })

    it("calls next() for authenticated user on /settings", async () => {
      const { ctx } = makeCtx("/settings", {
        sessionToken: "tok",
        user: { roles: ["viewer"] },
      })
      await (onRequest as Function)(ctx, next)
      expect(next).toHaveBeenCalled()
    })

    it("calls next() for authenticated user on /api/auth/me", async () => {
      const { ctx } = makeCtx("/api/auth/me", {
        sessionToken: "tok",
        user: { roles: ["viewer"] },
      })
      await (onRequest as Function)(ctx, next)
      expect(next).toHaveBeenCalled()
    })

    it("calls next() for authenticated user on POST /api/auth/webauthn/revoke-passkey (not admin)", async () => {
      const { ctx } = makeCtx("/api/auth/webauthn/revoke-passkey", {
        method: "POST",
        sessionToken: "tok",
        user: { roles: ["viewer"] },
      })
      await (onRequest as Function)(ctx, next)
      expect(next).toHaveBeenCalled()
    })

    it("calls next() for authenticated user on POST /api/auth/revoke-access-token (not admin)", async () => {
      const { ctx } = makeCtx("/api/auth/revoke-access-token", {
        method: "POST",
        sessionToken: "tok",
        user: { roles: ["viewer"] },
      })
      await (onRequest as Function)(ctx, next)
      expect(next).toHaveBeenCalled()
    })

    it("does not treat prefix matches without slash as auth-required", async () => {
      const { ctx } = makeCtx("/settings-fake")
      await (onRequest as Function)(ctx, next)
      expect(ctx.redirect).toHaveBeenCalledWith("/login")
    })
  })
})
