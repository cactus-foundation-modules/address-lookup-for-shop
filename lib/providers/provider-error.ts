// A provider that refuses a request says why, in a body nobody was reading. The
// route turns any throw into a 502 and a shrug, so without this the only
// evidence a site owner has is "502" - which is true of a wrong key, an API
// that was never switched on, a key restricted to browser referrers, and a
// project with no billing set up. Those need four different fixes.
//
// The detail goes to the server log only. The public response stays a plain
// 502: it is answering a shopper's browser, and a provider's error text is
// nobody's business out there.
const MAX_DETAIL = 300

export async function describeProviderFailure(provider: string, res: Response): Promise<Error> {
  let detail = ''
  try {
    const body = await res.text()
    if (body) {
      // Google answers { error: { status, message } }; Ideal Postcodes answers
      // { code, message }. Anything else is reported as it arrived.
      let parsed: unknown = null
      try { parsed = JSON.parse(body) } catch { parsed = null }
      const asRecord = (v: unknown): Record<string, unknown> | null =>
        v != null && typeof v === 'object' ? (v as Record<string, unknown>) : null
      const root = asRecord(parsed)
      const inner = asRecord(root?.error) ?? root
      const status = typeof inner?.status === 'string' ? inner.status : ''
      const message = typeof inner?.message === 'string' ? inner.message : ''
      detail = [status, message].filter(Boolean).join(': ') || body
    }
  } catch {
    // A body that will not read is not worth failing over - the status alone is
    // still more than the route had before.
  }
  const suffix = detail ? ` - ${detail.slice(0, MAX_DETAIL)}` : ''
  return new Error(`${provider} refused the request (HTTP ${res.status})${suffix}`)
}
