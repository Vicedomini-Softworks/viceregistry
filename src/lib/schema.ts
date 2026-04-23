import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  primaryKey,
  integer,
  bigint,
  uniqueIndex,
} from "drizzle-orm/pg-core"

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
})

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
)

export const repositories = pgTable("repositories", {
  name: text("name").primaryKey(),
  tagCount: integer("tag_count").notNull().default(0),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
})

export const imageMetadata = pgTable(
  "image_metadata",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repository: text("repository").notNull(),
    tag: text("tag").notNull(),
    digest: text("digest"),
    totalSize: bigint("total_size", { mode: "number" }),
    os: text("os"),
    architecture: text("architecture"),
    createdAt: timestamp("created_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("image_metadata_repo_tag_idx").on(t.repository, t.tag)],
)

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  resource: text("resource"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
