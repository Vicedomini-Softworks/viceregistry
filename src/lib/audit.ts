import { db } from "./db"
import { auditLog } from "./schema"

export function writeAuditLog(entry: {
  userId: string | null
  action: string
  resource: string | null
  ipAddress: string | null
}) {
  db.insert(auditLog)
    .values(entry)
    .execute()
    .catch((e) => {
      console.error("Audit log write failed:", e)
    })
}
