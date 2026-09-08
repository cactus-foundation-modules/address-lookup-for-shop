// Google accepts at most fifteen two-letter region codes. Anything else in the
// settings box is dropped rather than passed on, because a malformed code is a
// 400 from Google and a checkout with no suggestions at all.
export function parseRegionCodes(raw: unknown): string[] {
  if (typeof raw !== 'string') return []
  const seen = new Set<string>()
  for (const part of raw.split(/[\s,]+/)) {
    const code = part.trim().toLowerCase()
    if (/^[a-z]{2}$/.test(code)) seen.add(code)
    if (seen.size === 15) break
  }
  return [...seen]
}
