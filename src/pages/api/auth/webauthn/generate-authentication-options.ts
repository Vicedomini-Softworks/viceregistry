import type { APIRoute } from "astro"
import { generateAuthenticationOptions } from "@simplewebauthn/server"


export const POST: APIRoute = async ({ cookies }) => {

  const appUrl = process.env.PUBLIC_URL;
  
  if (!appUrl) {
    if (process.env.DEBUG === "true") {
      console.error("PUBLIC_URL is not set");
    }
    return new Response(JSON.stringify({ error: "PUBLIC_URL is not set" }), { status: 500 })
  }

  const url = new URL(appUrl)
  const rpID = url.hostname

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
