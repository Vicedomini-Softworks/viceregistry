import { defineMiddleware } from "astro:middleware"
import { verifySessionToken } from "@/lib/auth"

const PUBLIC_ROUTES = ["/login", "/api/auth/login", "/api/auth/token", "/api/health"]

const ADMIN_PREFIXES = ["/admin", "/api/users"]

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url

  if (PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    return next()
  }

  const sessionToken = context.cookies.get("session")?.value

  if (!sessionToken) {
    if (pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }
    return context.redirect("/login")
  }

  let user: SessionPayload
  try {
    user = await verifySessionToken(sessionToken)
  } catch {
    context.cookies.delete("session", { path: "/" })
    if (pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }
    return context.redirect("/login")
  }

  if (ADMIN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (!user.roles.includes("admin")) {
      if (pathname.startsWith("/api/")) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        })
      }
      return context.redirect("/dashboard")
    }
  }

  context.locals.user = user
  return next()
})
