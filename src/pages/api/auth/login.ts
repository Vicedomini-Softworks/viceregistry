import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { users, userRoles, roles } from "@/lib/schema"
import { createSessionToken, setSessionCookie } from "@/lib/auth"
import { writeAuditLog } from "@/lib/audit"
import { loginSchema } from "@/lib/validations"
import { verifyTotpCode } from "@/lib/totp"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 })
  }
  const { username, password, totpCode } = parsed.data

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1)

  if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 })
  }

  if (user.totpEnabled) {
    if (!user.totpSecret) {
      return Response.json({ error: "2FA is enabled but not configured correctly" }, { status: 400 })
    }

    if (!totpCode) {
      return Response.json({ requiresTwoFactor: true }, { status: 200 })
    }

    if (!(await verifyTotpCode(user.totpSecret, totpCode))) {
      return Response.json({ error: "Invalid 2FA code", requiresTwoFactor: true }, { status: 401 })
    }
  }

  const roleRows = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, user.id))

  const roleNames = roleRows.map((r) => r.name)
  const token = await createSessionToken({
    sub: user.id,
    username: user.username,
    email: user.email,
    roles: roleNames,
  })
  setSessionCookie(cookies, token)

  writeAuditLog({
    userId: user.id,
    action: user.totpEnabled ? "login_2fa" : "login",
    resource: null,
    ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
  })

  return Response.json({
    ok: true,
    user: { id: user.id, username: user.username, email: user.email, roles: roleNames },
  })
}
