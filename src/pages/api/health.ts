import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

export const GET: APIRoute = async () => {
  try {
    await db.execute(sql`SELECT 1`)
    return Response.json({ status: "ok", db: "connected" })
  } catch {
    return Response.json({ status: "error", db: "disconnected" }, { status: 503 })
  }
}
