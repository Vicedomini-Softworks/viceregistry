import { useState } from "react"
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

interface Props {
  name: string
  tags: string[]
  registryHost: string
  isAdmin: boolean
}

export default function TagList({ name, tags: initialTags, registryHost, isAdmin }: Props) {
  const [tags, setTags] = useState(initialTags)

  const handleDeleted = (deletedTag: string) => {
    setTags((prev) => prev.filter((t) => t !== deletedTag))
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
      <Badge variant="secondary" className="self-start">{tags.length} tags</Badge>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tag</TableHead>
              <TableHead>Pull command</TableHead>
              {isAdmin && <TableHead className="w-12"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tags.map((tag) => (
              <TableRow key={tag}>
                <TableCell>
                  <a
                    href={`/image/${name}/${tag}`}
                    className="font-mono text-sm font-medium hover:underline"
                  >
                    {tag}
                  </a>
                </TableCell>
                <TableCell className="max-w-xs">
                  <PullCommand command={`docker pull ${registryHost}/${name}:${tag}`} />
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    <DeleteImageDialog
                      repositoryName={name}
                      tag={tag}
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
