import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { downloads, users } from "@/lib/schema"
import { eq } from "drizzle-orm"

export const POST: APIRoute = async ({ request }) => {
  const clientIp = request.headers.get("X-Real-IP") ?? request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim()
  if (clientIp && clientIp !== "127.0.0.1" && clientIp !== "::1" && clientIp !== "::ffff:127.0.0.1") {
    return new Response("Forbidden", { status: 403 })
  }

  try {
    const repo = request.headers.get("X-Repo")
    const tag = request.headers.get("X-Tag")
    const authHeader = request.headers.get("Authorization")
    const userAgent = request.headers.get("User-Agent")

    if (!repo) {
      return new Response("missing X-Repo", { status: 400 })
    }

    let userId: string | null = null
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const { jwtVerify, importSPKI } = await import("jose")
        const publicKeyPem = process.env.REGISTRY_TOKEN_PUBLIC_KEY ?? ""
        const publicKey = await importSPKI(publicKeyPem, "RS256")
        const token = authHeader.slice(7)
        const { payload } = await jwtVerify(token, publicKey)
        if (payload.sub) {
          const [userRow] = await db.select({ id: users.id }).from(users).where(eq(users.id, payload.sub)).limit(1)
          if (userRow) {
            userId = userRow.id
          }
        }
      } catch (e) {
        // Invalid token - continue without userId
      }
    }

    await db.insert(downloads).values({
      userId,
      repository: repo,
      tag: tag ?? null,
      action: "pull",
      ipAddress: clientIp,
      userAgent: userAgent ?? null,
    })

    return new Response("OK", { status: 200 })
  } catch (e) {
    console.error("analytics-track error:", e)
    return new Response("Internal error", { status: 500 })
  }
}