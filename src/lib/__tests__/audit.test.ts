import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockExecute, mockValues, mockInsert } = vi.hoisted(() => {
  const mockExecute = vi.fn()
  const mockValues = vi.fn(() => ({ execute: mockExecute }))
  const mockInsert = vi.fn(() => ({ values: mockValues }))
  return { mockExecute, mockValues, mockInsert }
})

vi.mock("@/lib/db", () => ({
  db: { insert: mockInsert },
}))

vi.mock("@/lib/schema", () => ({
  auditLog: {},
}))

import { writeAuditLog } from "@/lib/audit"

describe("writeAuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls db.insert with the entry", async () => {
    mockExecute.mockResolvedValue(undefined)
    const entry = {
      userId: "user-1",
      action: "DELETE",
      resource: "repo/tag",
      ipAddress: "127.0.0.1",
    }
    writeAuditLog(entry)
    // Allow microtasks to flush
    await new Promise((r) => setImmediate(r))
    expect(mockInsert).toHaveBeenCalled()
    expect(mockValues).toHaveBeenCalledWith(entry)
    expect(mockExecute).toHaveBeenCalled()
  })

  it("logs error to console on execute failure, does not throw", async () => {
    const err = new Error("DB down")
    mockExecute.mockRejectedValue(err)
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    writeAuditLog({ userId: null, action: "LOGIN", resource: null, ipAddress: null })
    await new Promise((r) => setImmediate(r))
    expect(spy).toHaveBeenCalledWith("Audit log write failed:", err)
    spy.mockRestore()
  })
})
