import { SignJWT, jwtVerify } from "jose"
import type { AstroCookies } from "astro"

const SESSION_EXPIRY = "8h"

function getSecret() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error("SESSION_SECRET env var is required")
  return new TextEncoder().encode(secret)
}

export async function createSessionToken(
  payload: Omit<SessionPayload, "iat" | "exp">,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_EXPIRY)
    .sign(getSecret())
}

export async function verifySessionToken(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, getSecret())
  return payload as unknown as SessionPayload
}

export function setSessionCookie(cookies: AstroCookies, token: string) {
  cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  })
}

export function clearSessionCookie(cookies: AstroCookies) {
  cookies.delete("session", { path: "/" })
}
