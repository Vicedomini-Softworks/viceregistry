import type { APIRoute } from "astro"
import { listTags } from "@/lib/registry-client"

export const GET: APIRoute = async ({ params }) => {
  const { name } = params
  if (!name) return Response.json({ error: "Missing name" }, { status: 400 })

  const tags = await listTags(name)
  return Response.json({ name, tags })
}
