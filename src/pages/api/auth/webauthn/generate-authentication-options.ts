import type { APIRoute } from "astro"
import { generateAuthenticationOptions } from "@simplewebauthn/server"

const appUrl = process.env.PUBLIC_URL || (process.env.NODE_ENV === "production" ? "https://localhost" : "http://localhost:4321")
const url = new URL(appUrl)
const rpID = url.hostname

export const POST: APIRoute = async ({ cookies }) => {
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
  })

  // Username-less passkey login: persist challenge in a short-lived HttpOnly cookie.
  cookies.set("webauthn_auth_challenge", options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 5,
  })

  return Response.json(options)
}
