import type { APIRoute } from "astro"
import { getManifest, getManifestDigest, deleteManifest } from "@/lib/registry-client"
import { db } from "@/lib/db"
import { imageMetadata, repositories } from "@/lib/schema"
import { and, eq, sql } from "drizzle-orm"

export const GET: APIRoute = async ({ params }) => {
  const { name, reference } = params
  if (!name || !reference) return Response.json({ error: "Missing params" }, { status: 400 })

  const res = await getManifest(name, reference)
  const body = await res.text()
  return new Response(body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
      "Docker-Content-Digest": res.headers.get("Docker-Content-Digest") ?? "",
    },
  })
}

export const DELETE: APIRoute = async ({ params, locals }) => {
  const { name, reference } = params
  if (!name || !reference) return Response.json({ error: "Missing params" }, { status: 400 })

  if (!locals.user?.roles.includes("admin")) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  // If reference looks like a tag (not a sha256 digest), resolve to digest first
  let digest = reference
  if (!reference.startsWith("sha256:")) {
    const resolved = await getManifestDigest(name, reference)
    if (!resolved) {
      return Response.json({ error: "Manifest not found" }, { status: 404 })
    }
    digest = resolved
  }

  const res = await deleteManifest(name, digest)
  if (!res.ok && res.status !== 202) {
    return Response.json({ error: "Failed to delete manifest" }, { status: res.status })
  }

  // Clean PG cache: remove the deleted tag's metadata row
  if (reference.startsWith("sha256:")) {
    await db
      .delete(imageMetadata)
      .where(and(eq(imageMetadata.repository, name), eq(imageMetadata.digest, reference)))
  } else {
    await db
      .delete(imageMetadata)
      .where(and(eq(imageMetadata.repository, name), eq(imageMetadata.tag, reference)))
  }

  // Update cached tag count
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(imageMetadata)
    .where(eq(imageMetadata.repository, name))
  await db
    .update(repositories)
    .set({ tagCount: count })
    .where(eq(repositories.name, name))

  return Response.json({ ok: true })
}
