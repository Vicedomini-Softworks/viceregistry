import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Copy, Check } from "lucide-react"

interface Props {
  command: string
}

export default function PullCommand({ command }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 font-mono text-sm">
      <span className="flex-1 text-muted-foreground">{command}</span>
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleCopy}>
        {copied ? (
          <Check className="h-3 w-3 text-green-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
    </div>
  )
}
