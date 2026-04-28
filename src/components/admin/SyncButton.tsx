"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"

export default function SyncButton() {
  const [syncing, setSyncing] = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch("/api/admin/sync", { method: "POST" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? "Sync failed")
      }
      toast.success("Registry synced", { description: "Reloading…", duration: 1500 })
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed")
      setSyncing(false)
    }
  }

  return (
    <Button variant="outline" onClick={handleSync} disabled={syncing}>
      <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
      {syncing ? "Syncing…" : "Sync registry"}
    </Button>
  )
}
