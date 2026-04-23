import { defineMiddleware } from "astro:middleware"
import { verifySessionToken } from "@/lib/auth"

// No auth required at all
const PUBLIC_ROUTES = [
  "/login",
  "/dashboard",
  "/repository",
  "/image",
  "/api/auth/login",
  "/api/auth/token",
  "/api/health",
  "/api/search",
]

// Admin only
const ADMIN_PREFIXES = ["/admin", "/api/users"]

// Auth required (but not admin)
const AUTH_PREFIXES = ["/settings", "/api/auth/logout", "/api/auth/me"]

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url

  const isPublic = PUBLIC_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/"),
  )

  // Try to attach user from session cookie on every request (best-effort)
  const sessionToken = context.cookies.get("session")?.value
  if (sessionToken) {
    try {
      context.locals.user = await verifySessionToken(sessionToken)
    } catch {
      context.cookies.delete("session", { path: "/" })
    }
  }

  if (isPublic) return next()

  // DELETE /api/registry/* requires admin
  if (pathname.startsWith("/api/registry/") && context.request.method === "DELETE") {
    if (!context.locals.user?.roles.includes("admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: context.locals.user ? 403 : 401,
        headers: { "Content-Type": "application/json" },
      })
    }
    return next()
  }

  // Remaining auth-required routes
  if (!context.locals.user) {
    if (pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }
    return context.redirect("/login")
  }

  // Admin guard
  if (ADMIN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (!context.locals.user.roles.includes("admin")) {
      if (pathname.startsWith("/api/")) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      }
      return context.redirect("/dashboard")
    }
  }

  return next()
})
