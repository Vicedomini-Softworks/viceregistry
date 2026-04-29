"use client"

import { useState, useEffect } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface AuditLog {
  id: string
  action: string
  resource: string | null
  ipAddress: string | null
  createdAt: string | Date
  userId: string | null
}

interface Props {
  initialLogs: AuditLog[]
}

export default function AuditTable({ initialLogs }: Props) {
  const [logs, setLogs] = useState(initialLogs)
  const [action, setAction] = useState("")
  const [resource, setResource] = useState("")
  const [ipAddress, setIpAddress] = useState("")
  const [loading, setLoading] = useState(false)

  const search = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (action) params.set("action", action)
    if (resource) params.set("resource", resource)
    if (ipAddress) params.set("ipAddress", ipAddress)
    params.set("limit", "100")

    try {
      const res = await fetch(`/api/admin/audit?${params}`)
      const data = await res.json()
      setLogs(data.logs)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const debounce = setTimeout(search, 300)
    return () => clearTimeout(debounce)
  }, [action, resource, ipAddress, search])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Filter by action..."
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="w-40"
        />
        <Input
          placeholder="Filter by resource..."
          value={resource}
          onChange={(e) => setResource(e.target.value)}
          className="w-48"
        />
        <Input
          placeholder="Filter by IP..."
          value={ipAddress}
          onChange={(e) => setIpAddress(e.target.value)}
          className="w-32"
        />
        <Button variant="outline" onClick={search} disabled={loading}>
          {loading ? "Loading..." : "Search"}
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>IP Address</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No audit logs found
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
<TableCell className="text-sm text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{log.userId ?? "—"}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted">
                      {log.action}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{log.resource ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {log.ipAddress ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}