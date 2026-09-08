// Google groups a run of autocomplete calls and the one details call that
// follows into a billed session, keyed by a token the browser mints. It is
// shopper-supplied and ends up in a request to Google, so it is checked against
// the UUID shape Google asks for rather than passed on as-is. A token that does
// not match is dropped, not rejected: the lookup still works, it is only billed
// as if no session had been opened.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function normaliseSessionToken(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const token = raw.trim()
  return UUID.test(token) ? token : null
}

// Minted in the browser, one per run of keystrokes. crypto.randomUUID is only
// available in a secure context, so an install served over plain http falls
// back to a UUID-shaped random string - the token has to be unique and match
// the shape, not be cryptographically anything.
export function makeSessionToken(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`
}
