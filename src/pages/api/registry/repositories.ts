import type { APIRoute } from "astro"
import { listRepositories } from "@/lib/registry-client"

export const GET: APIRoute = async () => {
  const repositories = await listRepositories()
  return Response.json({ repositories })
}
