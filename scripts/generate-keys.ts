import { generateKeyPair, exportPKCS8, exportSPKI } from "jose"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"

async function main() {
  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    modulusLength: 4096,
  })

  const privatePem = await exportPKCS8(privateKey)
  const publicPem = await exportSPKI(publicKey)

  mkdirSync("keys", { recursive: true })
  writeFileSync(join("keys", "registry-token.key"), privatePem, { mode: 0o600 })
  writeFileSync(join("keys", "registry-token.crt"), publicPem)

  const privateEnv = privatePem.trim().replace(/\n/g, "\\n")
  const publicEnv = publicPem.trim().replace(/\n/g, "\\n")

  console.log("Keys written to keys/")
  console.log("\nAdd to .env:")
  console.log(`REGISTRY_TOKEN_PRIVATE_KEY="${privateEnv}"`)
  console.log(`REGISTRY_TOKEN_PUBLIC_KEY="${publicEnv}"`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
