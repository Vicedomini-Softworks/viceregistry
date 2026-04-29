import { useState, useCallback, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Search, Package, Tag as TagIcon } from "lucide-react"

interface Repo {
  name: string
  tagCount: number
  sizeBytes: number | null
  lastSyncedAt: string
}

interface ImageResult {
  repository: string
  tag: string
  digest: string | null
  totalSize: number | null
  os: string | null
  architecture: string | null
}

interface SearchResults {
  repositories: Repo[]
  images: ImageResult[]
}

interface Props {
  repositories: Repo[]
  registryHost: string
  isAdmin: boolean
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—"
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function RepositoryList({ repositories, registryHost }: Props) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data: SearchResults = await res.json()
      setResults(data)
    } catch {
      // keep previous results
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query) {
      debounceRef.current = setTimeout(() => search(query), 250)
    } else {
      setResults(null)
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, search])

  const displayedRepos = results ? results.repositories : repositories
  const matchedImages = results?.images ?? []

  const isEmpty = displayedRepos.length === 0 && matchedImages.length === 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search repositories or tags…"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {!query && (
          <Badge variant="secondary">{repositories.length} repositories</Badge>
        )}
        {query && !loading && results && (
          <Badge variant="secondary">
            {displayedRepos.length + matchedImages.length} results
          </Badge>
        )}
        {loading && (
          <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        )}
      </div>

      {isEmpty && !loading && (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <Package className="h-10 w-10" />
          <p className="text-sm">
            {repositories.length === 0 && !query
              ? "No repositories yet. Push your first image."
              : "No results match your search."}
          </p>
          {repositories.length === 0 && !query && (
            <code className="mt-2 rounded bg-muted px-3 py-1 text-xs font-mono">
              docker push {registryHost}/your-image:tag
            </code>
          )}
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </div>
      )}

      {!loading && displayedRepos.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Repository</TableHead>
                <TableHead className="w-24 text-right">Tags</TableHead>
                <TableHead className="w-28 text-right">Size</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedRepos.map((repo) => (
                <TableRow
                  key={repo.name}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => (window.location.href = `/r/${encodeURI(repo.name)}`)}
                >
                  <TableCell className="flex items-center gap-2 font-medium">
                    <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {repo.name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {repo.tagCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatBytes(repo.sizeBytes)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && matchedImages.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Matching images
          </p>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Image</TableHead>
                  <TableHead className="w-20">OS</TableHead>
                  <TableHead className="w-24">Arch</TableHead>
                  <TableHead className="w-28 text-right">Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matchedImages.map((img) => (
                  <TableRow
                    key={`${img.repository}:${img.tag}`}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() =>
                      (window.location.href = `/image/${img.repository}/${img.tag}`)
                    }
                  >
                    <TableCell className="flex items-center gap-2 font-mono text-sm">
                      <TagIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span>
                        {img.repository}
                        <span className="text-primary">:{img.tag}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{img.os ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{img.architecture ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatBytes(img.totalSize)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
