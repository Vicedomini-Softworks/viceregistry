/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  ignorePatterns: [".*/**", "skills/**", "node_modules/**", "dist/**", "temp_caveman/**"],
  mutate: [
    "src/lib/utils.ts",
    "src/lib/validations.ts",
    "src/lib/auth.ts",
    "src/lib/registry-token.ts",
    "src/lib/audit.ts",
    "src/lib/registry-client.ts",
    "src/lib/registry-sync.ts",
    "src/middleware/index.ts",
  ],
  coverageAnalysis: "perTest",
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ["progress", "clear-text", "json"],
}
