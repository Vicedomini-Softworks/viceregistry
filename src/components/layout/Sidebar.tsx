import { cn } from "@/lib/utils"
import { LayoutDashboard, Users, Package } from "lucide-react"

interface Props {
  roles: string[]
  currentPath: string
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users, adminOnly: true },
]

export default function Sidebar({ roles, currentPath }: Props) {
  const isAdmin = roles.includes("admin")

  return (
    <aside className="flex w-60 flex-col border-r bg-card">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <Package className="h-5 w-5 text-primary" />
        <span className="font-semibold">ViceRegistry</span>
      </div>
      <nav className="flex flex-col gap-1 p-3">
        {navItems.map((item) => {
          if (item.adminOnly && !isAdmin) return null
          const active = currentPath === item.href || currentPath.startsWith(item.href + "/")
          const Icon = item.icon
          return (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </a>
          )
        })}
      </nav>
    </aside>
  )
}
