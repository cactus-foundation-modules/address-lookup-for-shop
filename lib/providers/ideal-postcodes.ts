// Thin server-side client for the two Ideal Postcodes endpoints this module
// uses. The key travels in the Authorization header, never the query string,
// so it stays out of request logs.
//
// Ideal Postcodes bills only when a full address comes back, so autocomplete
// costs nothing and resolve costs one credit.
import type { AlkSuggestion } from '@/modules/address-lookup-for-shop/lib/types'
import type { AlkProviderClient } from '@/modules/address-lookup-for-shop/lib/providers/types'
import type { ShpLookupAddress } from '@/modules/shop/components/public/checkout-address-lookup'

const BASE = 'https://api.ideal-postcodes.co.uk/v1'

function authHeaders(apiKey: string): HeadersInit {
  return { Authorization: `IDEALPOSTCODES api_key="${apiKey}"` }
}

export async function autocompleteAddresses(apiKey: string, query: string, limit = 8): Promise<AlkSuggestion[]> {
  const url = `${BASE}/autocomplete/addresses?query=${encodeURIComponent(query)}&limit=${limit}`
  const res = await fetch(url, { headers: authHeaders(apiKey) })
  if (!res.ok) throw new Error(`Ideal Postcodes autocomplete failed: ${res.status}`)
  const data = await res.json()
  const hits: unknown = data?.result?.hits
  if (!Array.isArray(hits)) return []
  return hits
    .filter((h): h is { udprn: number; suggestion: string } =>
      h != null && typeof h === 'object' && typeof (h as Record<string, unknown>).udprn === 'number' && typeof (h as Record<string, unknown>).suggestion === 'string')
    .map((h) => ({ id: String(h.udprn), suggestion: h.suggestion }))
}

export async function resolveUdprn(apiKey: string, udprn: number): Promise<ShpLookupAddress | null> {
  const res = await fetch(`${BASE}/udprn/${udprn}`, { headers: authHeaders(apiKey) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Ideal Postcodes udprn lookup failed: ${res.status}`)
  const data = await res.json()
  const r = data?.result
  if (!r || typeof r !== 'object') return null
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const line1 = s(r.line_1)
  if (!line1) return null
  // PAF's line_2 and line_3 fold into shop's single second line; the join only
  // fires when both are present, which PAF reserves for genuinely long
  // addresses.
  const line2 = [s(r.line_2), s(r.line_3)].filter(Boolean).join(', ')
  return { line1, line2, city: s(r.post_town), county: s(r.county), postcode: s(r.postcode) }
}

// A UDPRN is a positive integer, and the string form has to round-trip so a
// padded or signed id never reaches the provider.
export function isUdprn(id: string): boolean {
  const n = Number.parseInt(id, 10)
  return Number.isInteger(n) && n > 0 && String(n) === id
}

export function createIdealPostcodesClient(apiKey: string): AlkProviderClient {
  return {
    isValidId: isUdprn,
    autocomplete: (query) => autocompleteAddresses(apiKey, query),
    resolve: (id) => resolveUdprn(apiKey, Number.parseInt(id, 10)),
  }
}
