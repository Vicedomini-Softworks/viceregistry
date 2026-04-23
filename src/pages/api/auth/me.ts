import type { APIRoute } from "astro"

export const GET: APIRoute = async ({ locals }) => {
  const { user } = locals
  return Response.json({
    id: user.sub,
    username: user.username,
    email: user.email,
    roles: user.roles,
  })
}
