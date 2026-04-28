import { useState, useEffect } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import PullCommand from "./PullCommand"
import DeleteImageDialog from "./DeleteImageDialog"
import { Tag } from "lucide-react"

interface TagRow {
  tag: string
  digest: string | null
  totalSize: number | null
  os: string | null
  architecture: string | null
}

interface DownloadStats {
  [tag: string]: number
}

interface Props {
  name: string
  tags: TagRow[]
  registryHost: string
  isAdmin: boolean
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—"
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function TagList({ name, tags: initialTags, registryHost, isAdmin }: Props) {
  const [tags, setTags] = useState(initialTags)
  const [downloads, setDownloads] = useState<DownloadStats>({})

  useEffect(() => {
    fetch(`/api/analytics/downloads?repository=${encodeURIComponent(name)}&groupBy=tag`)
      .then((r) => r.json())
      .then((data) => {
        const stats: DownloadStats = {}
        for (const d of data.downloads ?? []) {
          if (d.tag) stats[d.tag] = d.count
        }
        setDownloads(stats)
      })
      .catch(console.error)
  }, [name])

  const handleDeleted = (deletedTag: string) => {
    setTags((prev) => prev.filter((t) => t.tag !== deletedTag))
  }

  if (tags.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
        <Tag className="h-10 w-10" />
        <p className="text-sm">No tags found for this repository.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Badge variant="secondary" className="self-start">
        {tags.length} tag{tags.length === 1 ? "" : "s"}
      </Badge>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tag</TableHead>
              <TableHead className="w-20">OS</TableHead>
              <TableHead className="w-24">Arch</TableHead>
              <TableHead className="w-28 text-right">Size</TableHead>
              <TableHead className="w-20 text-right">Downloads</TableHead>
              <TableHead>Pull command</TableHead>
              {isAdmin && <TableHead className="w-12"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tags.map((row) => (
              <TableRow key={row.tag}>
                <TableCell>
                  <a
                    href={`/image/${name}/${row.tag}`}
                    className="font-mono text-sm font-medium hover:underline"
                  >
                    {row.tag}
                  </a>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{row.os ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{row.architecture ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                  {formatBytes(row.totalSize)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                  {downloads[row.tag] ?? 0}
                </TableCell>
                <TableCell className="max-w-xs">
                  <PullCommand command={`docker pull ${registryHost}/${name}:${row.tag}`} />
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    <DeleteImageDialog
                      repositoryName={name}
                      tag={row.tag}
                      onDeleted={handleDeleted}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
