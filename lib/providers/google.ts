// Server-side client for the Google Places API (New). The key travels in the
// X-Goog-Api-Key header, never the query string, so it stays out of request
// logs - and it never reaches the browser at all.
//
// Billing note: Autocomplete Requests and Place Details Essentials are separate
// SKUs, each with its own free monthly allowance, and a session token groups a
// run of keystrokes with the one details call that follows so Google bills them
// as a session rather than individually. The token is minted by the browser and
// passed straight through; a fresh one starts after every pick.
//
// Field masks are mandatory on this API and they decide the SKU. Only
// addressComponents is asked for, which sits in the cheaper Essentials tier;
// adding a Pro field to the mask would quietly move every lookup up a tier.
import type { AlkSuggestion } from '@/modules/address-lookup-for-shop/lib/types'
import type { AlkProviderClient } from '@/modules/address-lookup-for-shop/lib/providers/types'
import type { ShpLookupAddress } from '@/modules/shop/components/public/checkout-address-lookup'

const BASE = 'https://places.googleapis.com/v1'
const AUTOCOMPLETE_MASK = 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text'
const DETAILS_MASK = 'addressComponents'

export type GoogleAddressComponent = {
  longText?: unknown
  shortText?: unknown
  types?: unknown
}

// Place ids are opaque, but they are drawn from a URL-safe alphabet, so this
// keeps anything that could reshape the request path out of the URL.
const PLACE_ID = /^[A-Za-z0-9_-]{1,512}$/

export function isPlaceId(id: string): boolean {
  return PLACE_ID.test(id)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function componentTypes(c: GoogleAddressComponent): string[] {
  return Array.isArray(c.types) ? c.types.filter((t): t is string => typeof t === 'string') : []
}

// Google's address components carry no notion of a PAF delivery line, so the
// two halves are rebuilt here: anything identifying a unit within a building
// becomes line 1, the street itself becomes line 2, which is how PAF splits the
// same address. A plain house-and-street address has no unit, so it lands on
// line 1 with line 2 left empty - exactly as Ideal Postcodes returns it.
export function mapGoogleAddress(components: GoogleAddressComponent[]): ShpLookupAddress | null {
  const pick = (type: string): string => {
    const hit = components.find((c) => componentTypes(c).includes(type))
    return hit ? text(hit.longText) : ''
  }

  const street = [pick('street_number'), pick('route')].filter(Boolean).join(' ')
  const unit = [pick('subpremise'), pick('premise')].filter(Boolean).join(', ')
  const line1 = unit || street
  if (!line1) return null
  const line2 = unit ? street : ''

  return {
    line1,
    line2,
    // postal_town is the UK post town; locality covers everywhere Google does
    // not publish one.
    city: pick('postal_town') || pick('locality'),
    // Level 2 is the county. Level 1 in the UK is the nation ("England"), which
    // is not what a delivery label wants, so there is deliberately no fallback.
    county: pick('administrative_area_level_2'),
    postcode: pick('postal_code'),
  }
}

export async function autocompleteAddresses(
  apiKey: string,
  query: string,
  sessionToken: string | null,
  regionCodes: string[],
): Promise<AlkSuggestion[]> {
  // includedPrimaryTypes is deliberately absent. Google only accepts its Table
  // A, Table B and type-collection values there, and none of the address types
  // (street_address, premise, subpremise) is among them - passing one is a 400,
  // and the two collections that do exist ((cities), (regions)) are coarser
  // than a delivery address needs. Region codes do the narrowing instead.
  const body: Record<string, unknown> = { input: query }
  if (sessionToken) body.sessionToken = sessionToken
  if (regionCodes.length > 0) body.includedRegionCodes = regionCodes

  const res = await fetch(`${BASE}/places:autocomplete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': AUTOCOMPLETE_MASK,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Google Places autocomplete failed: ${res.status}`)
  const data = await res.json()
  const suggestions: unknown = data?.suggestions
  if (!Array.isArray(suggestions)) return []

  const out: AlkSuggestion[] = []
  for (const entry of suggestions) {
    if (entry == null || typeof entry !== 'object') continue
    const prediction = (entry as Record<string, unknown>).placePrediction
    if (prediction == null || typeof prediction !== 'object') continue
    const p = prediction as Record<string, unknown>
    const id = text(p.placeId)
    const label = text((p.text as Record<string, unknown> | undefined)?.text)
    // Query predictions carry no place id and cannot be resolved to an address.
    if (!id || !label || !isPlaceId(id)) continue
    out.push({ id, suggestion: label })
  }
  return out
}

export async function resolvePlaceId(
  apiKey: string,
  placeId: string,
  sessionToken: string | null,
): Promise<ShpLookupAddress | null> {
  const url = new URL(`${BASE}/places/${encodeURIComponent(placeId)}`)
  // Google takes the token as a query parameter on the details call, unlike the
  // autocomplete call where it is a body field.
  if (sessionToken) url.searchParams.set('sessionToken', sessionToken)

  const res = await fetch(url, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': DETAILS_MASK },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Google Places details failed: ${res.status}`)
  const data = await res.json()
  const components: unknown = data?.addressComponents
  if (!Array.isArray(components)) return null
  return mapGoogleAddress(components.filter((c): c is GoogleAddressComponent => c != null && typeof c === 'object'))
}

export function createGoogleClient(apiKey: string, regionCodes: string[]): AlkProviderClient {
  return {
    isValidId: isPlaceId,
    autocomplete: (query, sessionToken) => autocompleteAddresses(apiKey, query, sessionToken, regionCodes),
    resolve: (id, sessionToken) => resolvePlaceId(apiKey, id, sessionToken),
  }
}
