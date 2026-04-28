import { generateSecret, generateURI, verify } from "otplib"

const appName = "ViceRegistry"

export function generateTotpSecret() {
  return generateSecret()
}

export function getTotpUri(username: string, secret: string) {
  return generateURI({
    issuer: appName,
    label: username,
    secret,
    period: 30,
  })
}

export async function verifyTotpCode(secret: string, code: string) {
  const result = await verify({
    secret,
    token: code,
    window: 1,
  })
  return Boolean(result && "isValid" in result ? result.isValid : false)
}
