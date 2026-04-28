import type { APIRoute } from "astro"
import { db } from "@/lib/db"
import { downloads } from "@/lib/schema"
import { and, eq, sql, desc } from "drizzle-orm"

export const GET: APIRoute = async ({ url, locals }) => {
  const user = locals.user
  if (!user) {
    return new Response("Unauthorized", { status: 401 })
  }

  const repository = url.searchParams.get("repository")
  const tag = url.searchParams.get("tag")
  const groupBy = url.searchParams.get("groupBy") ?? "tag"

  if (!repository) {
    return new Response("repository required", { status: 400 })
  }

  try {
    let result: Record<string, unknown>[]
    if (groupBy === "tag") {
      result = await db
        .select({
          tag: downloads.tag,
          count: sql<number>`count(*)::int`.as("count"),
        })
        .from(downloads)
        .where(and(eq(downloads.repository, repository), eq(downloads.action, "pull")))
        .groupBy(downloads.tag)
        .orderBy(desc(sql`count(*)::int`))
        .limit(50)
    } else if (groupBy === "day") {
      const tagFilter = tag ? and(eq(downloads.tag, tag)) : undefined
      result = await db
        .select({
          date: sql<string>`date(${downloads.createdAt})`.as("date"),
          tag: downloads.tag,
          count: sql<number>`count(*)::int`.as("count"),
        })
        .from(downloads)
        .where(and(eq(downloads.repository, repository), eq(downloads.action, "pull"), tagFilter))
        .groupBy(sql`date(${downloads.createdAt})`, downloads.tag)
        .orderBy(desc(sql`date(${downloads.createdAt})`))
        .limit(30)
    } else {
      result = await db
        .select({
          count: sql<number>`count(*)::int`.as("count"),
        })
        .from(downloads)
        .where(and(eq(downloads.repository, repository), eq(downloads.action, "pull")))
        .limit(1)
    }

    return new Response(JSON.stringify({ downloads: result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (e) {
    console.error("downloads API error:", e)
    return new Response("Internal error", { status: 500 })
  }
}