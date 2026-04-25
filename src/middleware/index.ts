import { defineMiddleware } from "astro:middleware"
import { verifySessionToken } from "@/lib/auth"

// No auth required at all
const PUBLIC_ROUTES = [
  "/login",
  "/dashboard",
  "/repository",
  "/r",
  "/image",
  "/api/auth/login",
  "/api/auth/token",
  // Passkey sign-in (no session yet; must not require auth)
  "/api/auth/webauthn/generate-authentication-options",
  "/api/auth/webauthn/verify-authentication",
  "/api/health",
  "/api/search",
  "/v2",
]

// Admin only
const ADMIN_PREFIXES = ["/admin", "/api/users"]

export const onDockerRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url
  
  // Reverse proxy per /v2/*
  if (pathname.startsWith("/v2/")) {
    const targetUrl = `${process.env.REGISTRY_URL ?? "http://registry:5000"}${pathname}${search}`
    // Clona headers tranne quelli hop-by-hop
    const headers = new Headers(context.request.headers)
    headers.delete("host")

    // Fai forward della richiesta originale
    const response = await fetch(targetUrl, {
      method: context.request.method,
      headers,
      body: ["GET", "HEAD"].includes(context.request.method) ? undefined : context.request.body,
      redirect: "manual",
    })

    // Ricostruisci la response da inoltrare al client Docker
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    })
  }

  return next()
})

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
    if (!context.locals.user?.roles?.includes("admin")) {
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
})
