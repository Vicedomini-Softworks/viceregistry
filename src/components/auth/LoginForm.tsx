import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Fingerprint } from "lucide-react"
import { startAuthentication } from "@simplewebauthn/browser"

export default function LoginForm() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [totpCode, setTotpCode] = useState("")
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, totpCode: totpCode || undefined }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.requiresTwoFactor) {
          setRequiresTwoFactor(true)
          setError("Enter the 6-digit code from your authenticator app")
          return
        }
        window.location.href = "/dashboard"
        return
      }

      const data = await res.json()
      if (data.requiresTwoFactor) {
        setRequiresTwoFactor(true)
      }
      setError(data.error ?? "Login failed")
    } catch {
      setError("Network error, please try again")
    } finally {
      setLoading(false)
    }
  }

  const handleWebAuthnLogin = async () => {
    setError("")
    setLoading(true)

    try {
      const optsRes = await fetch("/api/auth/webauthn/generate-authentication-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      if (!optsRes.ok) throw new Error((await optsRes.json()).error || "Failed to get options")
      const options = await optsRes.json()

      const authResp = await startAuthentication({ optionsJSON: options })

      const verifyRes = await fetch("/api/auth/webauthn/verify-authentication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: authResp }),
      })

      if (verifyRes.ok) {
        window.location.href = "/dashboard"
        return
      }

      throw new Error((await verifyRes.json()).error || "Verification failed")
    } catch (err: any) {
      setError(err.message || "Passkey login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <img src="/logo-favicon.png" alt="ViceRegistry Logo" className="h-12 w-auto" />
          </div>
          <CardTitle className="text-2xl">ViceRegistry</CardTitle>
          <CardDescription>Sign in to manage your Docker registry</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {requiresTwoFactor && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="totp">Authenticator Code</Label>
                <Input
                  id="totp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="123456"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
              </div>
            )}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>
            <Button type="button" variant="outline" onClick={handleWebAuthnLogin} disabled={loading} className="w-full">
              <Fingerprint className="mr-2 h-4 w-4" />
              Sign in with Passkey
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
