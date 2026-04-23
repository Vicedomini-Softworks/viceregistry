import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type Role = "admin" | "push" | "viewer"

const roleColors: Record<Role, string> = {
  admin: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400",
  push: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400",
  viewer: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400",
}

interface Props {
  role: string
}

export default function RoleBadge({ role }: Props) {
  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-medium", roleColors[role as Role] ?? "")}
    >
      {role}
    </Badge>
  )
}
