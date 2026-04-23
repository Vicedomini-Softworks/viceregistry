import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import * as schema from "./schema"

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  throw new Error("DATABASE_URL is missing")
}

const sql = postgres(dbUrl)
export const db = drizzle(sql, { schema })
