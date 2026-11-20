// The county a provider hands back, tidied to the one a person would write.
//
// Royal Mail has not needed a county since 1996 and nobody puts one on a London
// address: the post town already says London, and "Greater London" is an
// administrative area, not a postal one. Google names it on every London hit
// regardless, and it is the one county a shopper would never type, so it stood
// out on every label - and stood out worse when a later postcode edit left it
// on an address nowhere near London. Dropped here, along with any county that
// only repeats the post town ("London, London"), because neither tells the
// courier anything. Every other county is kept exactly as the provider gave it.
const NEVER_WRITTEN = new Set(['greater london'])

function tidy(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function deliveryCounty(county: string, city: string): string {
  const c = tidy(county)
  if (!c || NEVER_WRITTEN.has(c) || c === tidy(city)) return ''
  return county.trim()
}
