import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import PullCommand from "./PullCommand"
import { Layers, HardDrive } from "lucide-react"

interface Layer {
  digest: string
  size: number
  mediaType: string
}

interface Props {
  name: string
  tag: string
  digest: string
  mediaType: string
  layers: Layer[]
  registryHost: string
  createdAt?: string
  os?: string
  architecture?: string
  /** From OCI label org.opencontainers.image.description */
  labelDescription?: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function ImageDetail({
  name,
  tag,
  digest,
  layers,
  registryHost,
  createdAt,
  os,
  architecture,
  labelDescription,
}: Props) {
  const totalSize = layers.reduce((acc, l) => acc + l.size, 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {os && <Badge variant="secondary">{os}</Badge>}
        {architecture && <Badge variant="secondary">{architecture}</Badge>}
        {digest ? (
          <Badge variant="outline" className="font-mono text-xs">
            {digest.slice(0, 19)}…
          </Badge>
        ) : null}
      </div>

      {labelDescription ? (
        <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">{labelDescription}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Pull command</CardTitle>
        </CardHeader>
        <CardContent>
          <PullCommand command={`docker pull ${registryHost}/${name}:${tag}`} />
        </CardContent>
      </Card>

      {createdAt && (
        <p className="text-sm text-muted-foreground">
          Built{" "}
          {new Date(createdAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Layers className="h-4 w-4" />
              Layers ({layers.length})
            </CardTitle>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <HardDrive className="h-4 w-4" />
              {formatBytes(totalSize)} total
            </span>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {layers.map((layer, i) => (
            <div key={layer.digest}>
              {i > 0 && <Separator />}
              <div className="flex items-center justify-between px-6 py-3">
                <span className="font-mono text-xs text-muted-foreground truncate max-w-[70%]">
                  {layer.digest}
                </span>
                <span className="text-sm text-muted-foreground shrink-0">
                  {formatBytes(layer.size)}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
