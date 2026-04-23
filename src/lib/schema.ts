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
  webauthnCurrentChallenge: text("webauthn_current_challenge"),
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

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const organizationMembers = pgTable(
  "organization_members",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // 'owner', 'admin', 'developer', 'viewer'
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.userId] })],
)

export const organizationRepositories = pgTable(
  "organization_repositories",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    repositoryName: text("repository_name")
      .notNull()
      .references(() => repositories.name, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.repositoryName] })],
)

export const userRepositoryPermissions = pgTable(
  "user_repository_permissions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    repositoryName: text("repository_name")
      .notNull()
      .references(() => repositories.name, { onDelete: "cascade" }),
    permission: text("permission").notNull().default("pull"), // 'pull', 'push', 'admin'
  },
  (t) => [primaryKey({ columns: [t.userId, t.repositoryName] })],
)

export const accessTokens = pgTable("access_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull(),
  prefix: text("prefix").notNull(), // e.g. "vr_"
  tokenPreview: text("token_preview"), // e.g. "vr_a...456"
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  repositoryName: text("repository_name"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  resource: text("resource"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const webauthnCredentials = pgTable("webauthn_credentials", {
  id: text("id").primaryKey(), // credential ID
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  publicKey: text("public_key").notNull(), // Base64URL encoded
  counter: bigint("counter", { mode: "number" }).notNull(),
  deviceType: text("device_type").notNull(),
  backedUp: boolean("backed_up").notNull(),
  transports: text("transports"), // comma separated
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
})
