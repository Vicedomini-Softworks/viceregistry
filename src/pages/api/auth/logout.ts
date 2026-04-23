import type { APIRoute } from "astro"
import { clearSessionCookie } from "@/lib/auth"

export const POST: APIRoute = async ({ cookies }) => {
  clearSessionCookie(cookies)
  return Response.json({ ok: true })
}
