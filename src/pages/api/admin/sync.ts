import type { APIRoute } from "astro"
import { syncAll } from "@/lib/registry-sync"

export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user?.roles.includes("admin")) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }
  await syncAll(true)
  return Response.json({ ok: true })
}
