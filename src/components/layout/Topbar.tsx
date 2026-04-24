import { useState } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LogOut, ChevronDown, LogIn } from "lucide-react"

interface Props {
  username: string | null
}

export default function Topbar({ username }: Props) {
  const [loading, setLoading] = useState(false)

  const handleLogout = async () => {
    setLoading(true)
    await fetch("/api/auth/logout", { method: "POST" })
    window.location.href = "/login"
  }

  if (!username) {
    return (
      <header className="flex h-14 items-center justify-end border-b bg-card px-4">
        <Button variant="outline" size="sm" asChild>
          <a href="/login" className="flex items-center gap-1.5">
            <LogIn className="h-4 w-4" />
            Sign in
          </a>
        </Button>
      </header>
    )
  }

  return (
    <header className="flex h-14 items-center justify-end border-b bg-card px-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2 px-2">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-xs">
                {username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{username}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onClick={handleLogout}
            disabled={loading}
            className="flex items-center gap-2 text-destructive focus:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
