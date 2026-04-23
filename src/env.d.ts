/// <reference types="astro/client" />

interface SessionPayload {
  sub: string
  username: string
  email: string
  roles: string[]
  iat: number
  exp: number
}

declare namespace App {
  interface Locals {
    user?: SessionPayload
  }
}
