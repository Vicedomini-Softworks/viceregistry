import type { APIRoute } from "astro"

export const GET: APIRoute = async ({ locals }) => {
  const { user } = locals
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  return Response.json({
    id: user.sub,
    username: user.username,
    email: user.email,
    roles: user.roles,
  })
}
