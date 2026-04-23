import { defineConfig } from "vitest/config"
import { resolve } from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    env: {
      REGISTRY_URL: "http://registry:5000",
    },
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
      thresholds: { lines: 95, functions: 95, branches: 95, statements: 95 },
      reporter: ["text", "json-summary"],
    },
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
})
