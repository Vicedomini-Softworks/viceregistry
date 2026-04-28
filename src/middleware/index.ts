import { verifySessionToken } from "@/lib/auth"
import type { APIContext, MiddlewareHandler, MiddlewareNext } from "astro"

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/repository",
  "/r",
  "/image",
  "/api/auth/login",
  "/api/auth/token",
  "/api/auth/webauthn/generate-authentication-options",
  "/api/auth/webauthn/verify-authentication",
  "/api/health",
  "/api/search",
  "/api/analytics/registry-event",
  "/api/analytics/track",
]

const ADMIN_PREFIXES = ["/admin", "/api/users", "/api/admin"]

export const onRequest: MiddlewareHandler = async (context: APIContext, next: MiddlewareNext) => {
  const { pathname } = context.url

  const isPublic = PUBLIC_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/"),
  )

  const sessionToken = context.cookies.get("session")?.value
  if (sessionToken) {
    try {
      context.locals.user = await verifySessionToken(sessionToken)
    } catch {
      context.cookies.delete("session", { path: "/" })
    }
  }

  if (isPublic) return next()

  if (pathname.startsWith("/api/registry/") && context.request.method === "DELETE") {
    if (!context.locals.user?.roles?.includes("admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: context.locals.user ? 403 : 401,
        headers: { "Content-Type": "application/json" },
      })
    }
    return next()
  }

  if (!context.locals.user) {
    if (pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }
    return context.redirect("/login")
  }

  if (ADMIN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (!context.locals.user.roles?.includes("admin")) {
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
}
