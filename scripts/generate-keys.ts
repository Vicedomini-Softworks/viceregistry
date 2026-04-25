import { generateKeyPair, exportPKCS8 } from "jose"
import { writeFileSync, mkdirSync, readFileSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"

async function main() {
  const { privateKey } = await generateKeyPair("RS256", {
    modulusLength: 4096,
    extractable: true,
  })

  const privatePem = await exportPKCS8(privateKey)

  mkdirSync("keys", { recursive: true })
  const keyPath = join("keys", "registry-token.key")
  const crtPath = join("keys", "registry-token.crt")
  writeFileSync(keyPath, privatePem, { mode: 0o600 })

  // Registry requires an X.509 certificate, not a bare public key
  execSync(
    `openssl req -new -x509 -days 3650 -key ${keyPath} -out ${crtPath} -subj "/CN=viceregistry"`,
  )

  const certPem = readFileSync(crtPath, "utf8")

  const privateEnv = privatePem.trim().replace(/\n/g, "\\n")
  const publicEnv = certPem.trim().replace(/\n/g, "\\n")

  console.log("Keys written to keys/")
  console.log("\nAdd to .env:")
  console.log(`REGISTRY_TOKEN_PRIVATE_KEY="${privateEnv}"`)
  console.log(`REGISTRY_TOKEN_PUBLIC_KEY="${publicEnv}"`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
