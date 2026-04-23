import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { AlertCircle } from "lucide-react"

const ALL_ROLES = ["admin", "push", "viewer"] as const
type Role = (typeof ALL_ROLES)[number]

interface UserData {
  id?: string
  username?: string
  email?: string
  isActive?: boolean
  roles?: string[]
}

interface Props {
  user?: UserData
  mode: "create" | "edit"
}

export default function UserForm({ user, mode }: Props) {
  const [username, setUsername] = useState(user?.username ?? "")
  const [email, setEmail] = useState(user?.email ?? "")
  const [password, setPassword] = useState("")
  const [isActive, setIsActive] = useState(user?.isActive ?? true)
  const [selectedRoles, setSelectedRoles] = useState<Role[]>((user?.roles ?? ["viewer"]) as Role[])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const toggleRole = (role: Role) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (selectedRoles.length === 0) {
      setError("At least one role must be selected")
      return
    }

    setLoading(true)
    try {
      const url = mode === "create" ? "/api/users" : `/api/users/${user!.id}`
      const method = mode === "create" ? "POST" : "PUT"
      const body: Record<string, unknown> =
        mode === "create"
          ? { username, email, password, roles: selectedRoles }
          : { email, isActive, roles: selectedRoles, ...(password ? { password } : {}) }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        window.location.href = "/admin/users"
        return
      }

      const data = await res.json()
      setError(typeof data.error === "string" ? data.error : "An error occurred")
    } catch {
      setError("Network error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-w-md">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {mode === "create" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="lowercase, letters/numbers/_/-"
            required
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">
          {mode === "create" ? "Password" : "New password (leave blank to keep current)"}
        </Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required={mode === "create"}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Roles</Label>
        <div className="flex gap-2">
          {ALL_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => toggleRole(role)}
              className="focus:outline-none"
            >
              <Badge
                variant={selectedRoles.includes(role) ? "default" : "outline"}
                className="cursor-pointer select-none"
              >
                {role}
              </Badge>
            </button>
          ))}
        </div>
      </div>

      {mode === "edit" && (
        <div className="flex items-center gap-2">
          <Switch id="isActive" checked={isActive} onCheckedChange={setIsActive} />
          <Label htmlFor="isActive">Active</Label>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving…" : mode === "create" ? "Create user" : "Save changes"}
        </Button>
        <Button variant="outline" type="button" onClick={() => (window.location.href = "/admin/users")}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
