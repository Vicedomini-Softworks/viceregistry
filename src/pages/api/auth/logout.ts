import type { APIRoute } from "astro"
import { clearSessionCookie } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"

export const POST: APIRoute = async ({ cookies, locals, request }) => {
  const userId = locals.user?.sub ?? null
  if (userId) {
    writeAuditLog({
      userId,
      action: "logout",
      resource: null,
      ipAddress:
        request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
        request.headers.get("X-Real-IP") ??
        null,
    })
  }
  clearSessionCookie(cookies)
  return Response.json({ ok: true })
}
