import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import * as schema from "../src/lib/schema"
import { eq } from "drizzle-orm"
import bcrypt from "bcryptjs"

const sql = postgres(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

async function main() {
  const adminUsername = process.env.SEED_ADMIN_USERNAME ?? "admin"
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com"
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "changeme"

  const hash = await bcrypt.hash(adminPassword, 12)

  const [user] = await db
    .insert(schema.users)
    .values({ username: adminUsername, email: adminEmail, passwordHash: hash })
    .onConflictDoUpdate({
      target: schema.users.username,
      set: { updatedAt: new Date() },
    })
    .returning()

  const [adminRole] = await db
    .insert(schema.roles)
    .values({ name: "admin", description: "Administrator" })
    .onConflictDoUpdate({
      target: schema.roles.name,
      set: { description: "Administrator" },
    })
    .returning()

  await db
    .insert(schema.roles)
    .values([
      { name: "push", description: "Can push images" },
      { name: "pull", description: "Can pull images" },
    ])
    .onConflictDoNothing()

  if (!adminRole) {
    console.error("Admin role not found. Run migrations and seed roles SQL first.")
    process.exit(1)
  }

  await db
    .insert(schema.userRoles)
    .values({ userId: user.id, roleId: adminRole.id })
    .onConflictDoNothing()

  console.log(`Admin user '${adminUsername}' ready. ID: ${user.id}`)
  await sql.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
