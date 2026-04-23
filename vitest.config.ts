import { defineConfig } from "vitest/config"
import { resolve } from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      include: [
        "src/lib/utils.ts",
        "src/lib/validations.ts",
        "src/lib/auth.ts",
        "src/lib/registry-token.ts",
        "src/lib/audit.ts",
        "src/lib/registry-client.ts",
        "src/lib/registry-sync.ts",
        "src/middleware/index.ts",
      ],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
      reporter: ["text", "json-summary"],
    },
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
})
