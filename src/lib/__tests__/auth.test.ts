import { describe, it, expect, vi, beforeEach } from "vitest"
import { createSessionToken, verifySessionToken, setSessionCookie, clearSessionCookie } from "@/lib/auth"

function makeCookies() {
  return { set: vi.fn(), delete: vi.fn(), get: vi.fn() }
}

describe("auth", () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv("SESSION_SECRET", "test-secret-that-is-at-least-32-chars!!")
  })

  describe("createSessionToken", () => {
    it("returns a JWT string", async () => {
      const token = await createSessionToken({
        sub: "user-1",
        email: "user@example.com",
        username: "alice",
        roles: ["viewer"],
      })
      expect(typeof token).toBe("string")
      expect(token.split(".")).toHaveLength(3)
    })
  })

  describe("verifySessionToken", () => {
    it("round-trips a valid token", async () => {
      const payload = { sub: "user-1",
        email: "user@example.com", username: "alice", roles: ["admin"] }
      const token = await createSessionToken(payload)
      const result = await verifySessionToken(token)
      expect(result.sub).toBe("user-1")
      expect(result.username).toBe("alice")
    })

    it("throws on invalid token", async () => {
      await expect(verifySessionToken("not.a.token")).rejects.toThrow()
    })

    it("throws on token signed with wrong secret", async () => {
      const token = await createSessionToken({ sub: "u", username: "u", email: "u@u.com", roles: [] })
      vi.stubEnv("SESSION_SECRET", "completely-different-secret-here!!")
      await expect(verifySessionToken(token)).rejects.toThrow()
    })
  })

  describe("getSecret — missing env var", () => {
    it("throws when SESSION_SECRET is absent", async () => {
      vi.stubEnv("SESSION_SECRET", "")
      await expect(createSessionToken({ sub: "u", username: "u", email: "u@u.com", roles: [] })).rejects.toThrow(
        "SESSION_SECRET env var is required",
      )
    })
  })

  describe("setSessionCookie", () => {
    it("calls cookies.set with correct options in non-production", () => {
      vi.stubEnv("NODE_ENV", "development")
      const cookies = makeCookies()
      setSessionCookie(cookies as any, "my-token")
      expect(cookies.set).toHaveBeenCalledWith("session", "my-token", {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 8,
      })
    })

    it("calls cookies.set with secure: true in production", () => {
      vi.stubEnv("NODE_ENV", "production")
      const cookies = makeCookies()
      setSessionCookie(cookies as any, "my-token")
      expect(cookies.set).toHaveBeenCalledWith("session", "my-token", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 8,
      })
    })
  })

  describe("clearSessionCookie", () => {
    it("calls cookies.delete with path /", () => {
      const cookies = makeCookies()
      clearSessionCookie(cookies as any)
      expect(cookies.delete).toHaveBeenCalledWith("session", { path: "/" })
    })
  })
})
