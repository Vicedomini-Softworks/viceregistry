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

export const updateSettingsSchema = z
  .object({
    email: z.string().email().optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8).max(256).optional(),
  })
  .refine((d) => !d.newPassword || d.currentPassword, {
    message: "currentPassword required to set newPassword",
  })
