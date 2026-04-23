import { z } from "zod"

export const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
})

export const createUserSchema = z.object({
  username: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9_-]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(256),
  roles: z.array(z.enum(["admin", "push", "viewer"])).min(1),
})

export const updateUserSchema = z
  .object({
    email: z.string().email().optional(),
    password: z.string().min(8).max(256).optional(),
    isActive: z.boolean().optional(),
    roles: z.array(z.enum(["admin", "push", "viewer"])).optional(),
  })
  .refine((d) => Object.keys(d).some((k) => d[k as keyof typeof d] !== undefined), {
    message: "At least one field must be provided",
  })

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,37}[a-z0-9]$/

export const SLUG_ERROR =
  "Slug must be 3–39 lowercase alphanumeric characters or hyphens, cannot start or end with a hyphen"

export function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 39)
}

export const createOrganizationSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(3).max(39).regex(SLUG_REGEX, SLUG_ERROR).optional(),
  description: z.string().max(500).optional(),
})

export const updateSettingsSchema = z
  .object({
    email: z.string().email().optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8).max(256).optional(),
  })
  .refine((d) => !d.newPassword || d.currentPassword, {
    message: "currentPassword required to set newPassword",
  })
