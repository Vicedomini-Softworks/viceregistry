import { useState } from "react"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Search, Package } from "lucide-react"

interface Props {
  repositories: string[]
  registryHost: string
}

export default function RepositoryList({ repositories, registryHost }: Props) {
  const [search, setSearch] = useState("")

  const filtered = repositories.filter((r) =>
    r.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search repositories…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Badge variant="secondary">{filtered.length} repositories</Badge>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <Package className="h-10 w-10" />
          <p className="text-sm">
            {repositories.length === 0
              ? "No repositories yet. Push your first image to get started."
              : "No repositories match your search."}
          </p>
          {repositories.length === 0 && (
            <code className="mt-2 rounded bg-muted px-3 py-1 text-xs font-mono">
              docker push {registryHost}/your-image:tag
            </code>
          )}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Repository</TableHead>
                <TableHead>Pull command</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((repo) => (
                <TableRow
                  key={repo}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => (window.location.href = `/repository/${repo}`)}
                >
                  <TableCell className="font-medium flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    {repo}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    docker pull {registryHost}/{repo}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
