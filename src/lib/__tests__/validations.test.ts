import { describe, it, expect } from "vitest"
import {
  loginSchema,
  createUserSchema,
  updateUserSchema,
  updateSettingsSchema,
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
    expect(updateUserSchema.safeParse({}).success).toBe(false)
  })

  it("rejects invalid email format", () => {
    expect(updateUserSchema.safeParse({ email: "bad" }).success).toBe(false)
  })

  it("rejects password under 8 chars", () => {
    expect(updateUserSchema.safeParse({ password: "short" }).success).toBe(false)
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
    expect(updateSettingsSchema.safeParse({ newPassword: "newpassword" }).success).toBe(false)
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
