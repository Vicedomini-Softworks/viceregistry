import { describe, it, expect } from "vitest"
import {
  loginSchema,
  createUserSchema,
  updateUserSchema,
  updateSettingsSchema,
  createOrganizationSchema,
  deriveSlug,
  SLUG_ERROR,
} from "@/lib/validations"

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    expect(loginSchema.safeParse({ username: "alice", password: "secret" }).success).toBe(true)
  })

  it("rejects empty username", () => {
    expect(loginSchema.safeParse({ username: "", password: "secret" }).success).toBe(false)
  })

  it("rejects password over 256 chars", () => {
    expect(loginSchema.safeParse({ username: "alice", password: "x".repeat(257) }).success).toBe(
      false,
    )
  })

  it("rejects missing fields", () => {
    expect(loginSchema.safeParse({}).success).toBe(false)
  })
})

describe("createUserSchema", () => {
  const valid = {
    username: "alice",
    email: "alice@example.com",
    password: "password123",
    roles: ["viewer"],
  }

  it("accepts valid user", () => {
    expect(createUserSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects username with invalid chars", () => {
    expect(createUserSchema.safeParse({ ...valid, username: "alice!" }).success).toBe(false)
    expect(createUserSchema.safeParse({ ...valid, username: "ALICE" }).success).toBe(false)
  })

  it("rejects username too short", () => {
    expect(createUserSchema.safeParse({ ...valid, username: "a" }).success).toBe(false)
  })

  it("rejects invalid email", () => {
    expect(createUserSchema.safeParse({ ...valid, email: "notanemail" }).success).toBe(false)
  })

  it("rejects password under 8 chars", () => {
    expect(createUserSchema.safeParse({ ...valid, password: "short" }).success).toBe(false)
  })

  it("rejects empty roles array", () => {
    expect(createUserSchema.safeParse({ ...valid, roles: [] }).success).toBe(false)
  })

  it("rejects invalid role value", () => {
    expect(createUserSchema.safeParse({ ...valid, roles: ["superuser"] }).success).toBe(false)
  })

  it("accepts multiple roles", () => {
    expect(
      createUserSchema.safeParse({ ...valid, roles: ["admin", "push", "viewer"] }).success,
    ).toBe(true)
  })
})

describe("updateUserSchema", () => {
  it("accepts valid email update", () => {
    expect(updateUserSchema.safeParse({ email: "new@example.com" }).success).toBe(true)
  })

  it("accepts isActive update", () => {
    expect(updateUserSchema.safeParse({ isActive: false }).success).toBe(true)
  })

  it("accepts roles update", () => {
    expect(updateUserSchema.safeParse({ roles: ["push"] }).success).toBe(true)
  })

  it("accepts password update", () => {
    expect(updateUserSchema.safeParse({ password: "newpassword" }).success).toBe(true)
  })

  it("rejects empty object (no fields provided)", () => {
    const result = updateUserSchema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("At least one field must be provided")
    }
  })

  it("rejects object with only undefined values", () => {
    const result = updateUserSchema.safeParse({ email: undefined, isActive: undefined })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("At least one field must be provided")
    }
  })

  it("rejects invalid roles", () => {
    expect(updateUserSchema.safeParse({ roles: ["invalid"] }).success).toBe(false)
    expect(updateUserSchema.safeParse({ roles: [""] }).success).toBe(false)
  })

  it("rejects invalid email format", () => {
    expect(updateUserSchema.safeParse({ email: "bad" }).success).toBe(false)
  })

  it("rejects password under 8 chars", () => {
    expect(updateUserSchema.safeParse({ password: "short" }).success).toBe(false)
  })
})

describe("createOrganizationSchema", () => {
  const valid = { name: "Acme Corp", slug: "acme-corp", description: "Our org" }

  it("accepts valid organization", () => {
    expect(createOrganizationSchema.safeParse(valid).success).toBe(true)
  })

  it("accepts organization without description", () => {
    expect(createOrganizationSchema.safeParse({ name: "Acme", slug: "acme" }).success).toBe(true)
  })

  it("accepts organization without slug (auto-derive from name)", () => {
    expect(createOrganizationSchema.safeParse({ name: "Acme" }).success).toBe(true)
  })

  it("rejects missing name", () => {
    expect(createOrganizationSchema.safeParse({ slug: "acme" }).success).toBe(false)
  })

  it("rejects slug with uppercase letters", () => {
    expect(createOrganizationSchema.safeParse({ ...valid, slug: "Acme-Corp" }).success).toBe(false)
  })

  it("rejects slug starting with hyphen", () => {
    expect(createOrganizationSchema.safeParse({ ...valid, slug: "-acme" }).success).toBe(false)
  })

  it("rejects slug ending with hyphen", () => {
    expect(createOrganizationSchema.safeParse({ ...valid, slug: "acme-" }).success).toBe(false)
  })

  it("rejects slug shorter than 3 chars", () => {
    expect(createOrganizationSchema.safeParse({ ...valid, slug: "ab" }).success).toBe(false)
  })

  it("rejects slug longer than 39 chars", () => {
    expect(createOrganizationSchema.safeParse({ ...valid, slug: "a".repeat(40) }).success).toBe(false)
  })

  it("rejects slug with spaces", () => {
    expect(createOrganizationSchema.safeParse({ ...valid, slug: "acme corp" }).success).toBe(false)
  })

  it("rejects slug with special characters", () => {
    expect(createOrganizationSchema.safeParse({ ...valid, slug: "acme_corp" }).success).toBe(false)
    expect(createOrganizationSchema.safeParse({ ...valid, slug: "acme.corp" }).success).toBe(false)
  })

  it("accepts slug with hyphens in the middle", () => {
    expect(createOrganizationSchema.safeParse({ ...valid, slug: "my-cool-org" }).success).toBe(true)
  })

  it("accepts minimum length slug of 3 chars", () => {
    expect(createOrganizationSchema.safeParse({ ...valid, slug: "abc" }).success).toBe(true)
  })

  it("accepts maximum length slug of 39 chars", () => {
    expect(createOrganizationSchema.safeParse({ ...valid, slug: "a" + "b".repeat(37) + "c" }).success).toBe(true)
  })

  it("returns the SLUG_ERROR message for invalid slug", () => {
    const result = createOrganizationSchema.safeParse({ ...valid, slug: "-bad" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(SLUG_ERROR)
    }
  })
})

describe("deriveSlug", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(deriveSlug("Acme Corp")).toBe("acme-corp")
  })

  it("strips leading and trailing hyphens", () => {
    expect(deriveSlug("---my org---")).toBe("my-org")
  })

  it("collapses multiple non-alphanumeric chars into single hyphen", () => {
    expect(deriveSlug("my  --  org")).toBe("my-org")
  })

  it("truncates to 39 chars", () => {
    expect(deriveSlug("a".repeat(50))).toHaveLength(39)
  })

  it("handles all-special-chars name gracefully", () => {
    expect(deriveSlug("---")).toBe("")
  })

  it("handles mixed alphanumeric and special chars", () => {
    expect(deriveSlug("Hello, World! 2024")).toBe("hello-world-2024")
  })

  it("folds Latin diacritics so letters are not stripped (e.g. accented capitals)", () => {
    expect(deriveSlug("École 42")).toBe("ecole-42")
    expect(deriveSlug("Café du Monde")).toBe("cafe-du-monde")
    expect(deriveSlug("Müller & Co")).toBe("muller-co")
  })
})

describe("updateSettingsSchema", () => {
  it("accepts email-only update", () => {
    expect(updateSettingsSchema.safeParse({ email: "me@example.com" }).success).toBe(true)
  })

  it("accepts password change with currentPassword", () => {
    expect(
      updateSettingsSchema.safeParse({
        currentPassword: "oldpass",
        newPassword: "newpassword",
      }).success,
    ).toBe(true)
  })

  it("rejects newPassword without currentPassword", () => {
    const result = updateSettingsSchema.safeParse({ newPassword: "newpassword" })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("currentPassword required to set newPassword")
    }
  })

  it("accepts empty object (all optional)", () => {
    expect(updateSettingsSchema.safeParse({}).success).toBe(true)
  })

  it("rejects short newPassword", () => {
    expect(
      updateSettingsSchema.safeParse({ currentPassword: "old", newPassword: "short" }).success,
    ).toBe(false)
  })
})
