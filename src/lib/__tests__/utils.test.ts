import { describe, it, expect } from "vitest"
import { cn } from "@/lib/utils"

describe("cn", () => {
  it("merges class strings", () => {
    expect(cn("foo", "bar")).toBe("foo bar")
  })

  it("handles conditional classes", () => {
    expect(cn("base", false && "skip", "keep")).toBe("base keep")
  })

  it("resolves Tailwind conflicts", () => {
    expect(cn("p-4", "p-2")).toBe("p-2")
  })

  it("handles arrays", () => {
    expect(cn(["a", "b"], "c")).toBe("a b c")
  })

  it("handles undefined/null", () => {
    expect(cn(undefined, null, "real")).toBe("real")
  })
})
