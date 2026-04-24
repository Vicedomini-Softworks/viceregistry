import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import { LayoutDashboard, Users, Building2, Settings } from "lucide-react"
import type { LucideIcon } from "lucide-react"

interface Props {
  roles: string[]
  currentPath: string
}

type NavItem = { href: string; label: string; icon: LucideIcon }

const workspaceItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/organizations", label: "Organizations", icon: Building2 },
  { href: "/settings", label: "Settings", icon: Settings },
]

const adminItems: NavItem[] = [{ href: "/admin/users", label: "Users", icon: Users }]

function isActivePath(currentPath: string, href: string) {
  return currentPath === href || currentPath.startsWith(href + "/")
}

function NavLink({ item, currentPath }: { item: NavItem; currentPath: string }) {
  const active = isActivePath(currentPath, item.href)
  const Icon = item.icon
  return (
    <a
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
    </a>
  )
}

export default function Sidebar({ roles, currentPath }: Props) {
  const isAdmin = roles.includes("admin")

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-card" aria-label="App navigation">
      <div className="flex h-14 items-center border-b px-4">
        <a
          href="/dashboard"
          className="flex items-center rounded-md outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img src="/logo-favicon.png" alt="ViceRegistry" className="h-8 w-auto" />
        </a>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Main">
        {workspaceItems.map((item) => (
          <NavLink key={item.href} item={item} currentPath={currentPath} />
        ))}

        {isAdmin && (
          <>
            <div className="my-2 px-1">
              <Separator className="bg-border" />
            </div>
            <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Admin</p>
            {adminItems.map((item) => (
              <NavLink key={item.href} item={item} currentPath={currentPath} />
            ))}
          </>
        )}
      </nav>
    </aside>
  )
}
