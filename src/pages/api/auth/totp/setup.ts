import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { users } from "@/lib/schema"
import { writeAuditLog } from "@/lib/audit"
import { generateTotpSecret, getTotpUri } from "@/lib/totp"
import { eq } from "drizzle-orm"

export const POST: APIRoute = async ({ locals }) => {
  const userId = locals.user?.sub
  const username = locals.user?.username
  if (!userId || !username) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const [user] = await db
    .select({ totpEnabled: users.totpEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!user) return Response.json({ error: "User not found" }, { status: 404 })
  if (user.totpEnabled) return Response.json({ error: "2FA is already enabled" }, { status: 400 })

  const secret = generateTotpSecret()
  const otpauthUrl = getTotpUri(username, secret)

  await db
    .update(users)
    .set({ totpPendingSecret: secret, updatedAt: new Date() })
    .where(eq(users.id, userId))

  writeAuditLog({ userId, action: "totp_setup_started", resource: userId, ipAddress: null })

  return Response.json({ secret, otpauthUrl })
}
