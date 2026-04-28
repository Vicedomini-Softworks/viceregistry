import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { downloads, users } from "@/lib/schema"
import { eq } from "drizzle-orm"

export const POST: APIRoute = async ({ request }) => {
  const clientIp = request.headers.get("X-Real-IP") ?? request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
  if (clientIp && clientIp !== "127.0.0.1" && clientIp !== "::1" && clientIp !== "::ffff:127.0.0.1") {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    })
  }

  try {
    const body = await request.json()

    const { repository, tag, digest, action, user, ipAddress, userAgent } = body

    if (!repository || !action) {
      return new Response(JSON.stringify({ error: "repository and action required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    let userId: string | null = null
    if (user) {
      const [userRow] = await db.select({ id: users.id }).from(users).where(eq(users.username, user)).limit(1)
      if (userRow) {
        userId = userRow.id
      }
    }

    await db.insert(downloads).values({
      userId,
      repository,
      tag: tag ?? null,
      digest: digest ?? null,
      action,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
    })

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    console.error("registry-event error:", e)
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}