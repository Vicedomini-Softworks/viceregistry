import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { auditLog, users } from "@/lib/schema"
import { and, eq, ilike, desc, sql, or } from "drizzle-orm"

export const GET: APIRoute = async ({ url, locals }) => {
  const user = locals.user
  if (!user || !user.roles.includes("admin")) {
    return new Response("Forbidden", { status: 403 })
  }

  const action = url.searchParams.get("action")
  const userId = url.searchParams.get("userId")
  const ipAddress = url.searchParams.get("ipAddress")
  const resource = url.searchParams.get("resource")
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 1000)
  const format = url.searchParams.get("format") ?? "json"
  const offset = parseInt(url.searchParams.get("offset") ?? "0")

  const conditions = []
  if (action) {
    conditions.push(eq(auditLog.action, action))
  }
  if (userId) {
    conditions.push(eq(auditLog.userId, userId))
  }
  if (ipAddress) {
    conditions.push(eq(auditLog.ipAddress, ipAddress))
  }
  if (resource) {
    conditions.push(ilike(auditLog.resource, `%${resource}%`))
  }
  if (from) {
    conditions.push(sql`${auditLog.createdAt} >= ${from}::timestamptz`)
  }
  if (to) {
    conditions.push(sql`${auditLog.createdAt} <= ${to}::timestamptz`)
  }

  const whereClause = conditions.length > 0
    ? and(...conditions)
    : undefined

  const logs = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      resource: auditLog.resource,
      ipAddress: auditLog.ipAddress,
      createdAt: auditLog.createdAt,
      userId: auditLog.userId,
    })
    .from(auditLog)
    .where(whereClause)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset)

  if (userId) {
    const userRows = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (userRows.length > 0) {
      for (const log of logs) {
        log.userId = userRows[0].username
      }
    }
  } else {
    const userIds = [...new Set(logs.map((l) => l.userId).filter(Boolean) as string[])]
    const userMap = new Map<string, string>()
    for (const uid of userIds) {
      const [row] = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.id, uid))
        .limit(1)
      if (row) userMap.set(row.id, row.username)
    }
    for (const log of logs) {
      if (log.userId) {
        const mapped = userMap.get(log.userId)
        if (mapped) log.userId = mapped
      }
    }
  }

  if (format === "csv") {
    const headers = ["id", "action", "resource", "ipAddress", "userId", "createdAt"]
    const rows = logs.map((log) =>
      headers.map((h) => JSON.stringify(log[h as keyof typeof log])).join(",")
    )
    const csv = [headers.join(","), ...rows].join("\n")
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(whereClause)

  return new Response(JSON.stringify({ logs, total: count }), {
    headers: { "Content-Type": "application/json" },
  })
}