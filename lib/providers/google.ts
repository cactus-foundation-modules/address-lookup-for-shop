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
import { describeProviderFailure } from '@/modules/address-lookup-for-shop/lib/providers/provider-error'

const BASE = 'https://places.googleapis.com/v1'
// structuredFormat splits a prediction into the place's own name (mainText)
// and the address around it (secondaryText). Autocomplete (New) is a single
// Essentials SKU with no field-dependent tiering - unlike Place Details, where
// the mask picks the tier - so asking for it costs nothing.
const AUTOCOMPLETE_MASK = [
  'suggestions.placePrediction.placeId',
  'suggestions.placePrediction.text.text',
  'suggestions.placePrediction.structuredFormat.mainText.text',
].join(',')
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

// Compared rather than displayed: case, punctuation and doubled spaces all vary
// between a prediction's wording and the address components' own.
function normalise(value: string): string {
  return value.toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Google's address components carry no notion of a PAF delivery line, so the
// two halves are rebuilt here: anything identifying a unit within a building
// becomes line 1, the street itself becomes line 2, which is how PAF splits the
// same address. A plain house-and-street address has no unit, so it lands on
// line 1 with line 2 left empty - exactly as Ideal Postcodes returns it.
export function mapGoogleAddress(
  components: GoogleAddressComponent[],
  placeName: string | null = null,
): ShpLookupAddress | null {
  const pick = (type: string): string => {
    const hit = components.find((c) => componentTypes(c).includes(type))
    return hit ? text(hit.longText) : ''
  }

  const street = [pick('street_number'), pick('route')].filter(Boolean).join(' ')

  // Everything naming a place WITHIN the street, in the order PAF writes it.
  const parts: string[] = []
  const seen = new Set<string>()
  const add = (value: string) => {
    const label = value.trim()
    if (!label) return
    const key = normalise(label)
    // A name that is simply the street again is not a premises name: Google's
    // mainText for an ordinary address is the address itself.
    if (!key || key === normalise(street) || seen.has(key)) return
    seen.add(key)
    parts.push(label)
  }
  add(pick('subpremise'))
  add(pick('premise'))
  // An establishment's own name is kept OUT of the address components
  // altogether - a marina, an office block, a business park comes back as bare
  // street number and route, with the name only in displayName (a Pro-tier
  // field) and in the prediction the shopper clicked. So it is carried in from
  // the prediction: it is the half of the address they recognise, and dropping
  // it silently replaced what they typed with a street they had never heard of.
  add(placeName ?? '')

  const line1 = parts.length > 0 ? parts.join(', ') : street
  if (!line1) return null
  const line2 = parts.length > 0 ? street : ''

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
  if (!res.ok) throw await describeProviderFailure('Google Places autocomplete', res)
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
    const structured = p.structuredFormat as Record<string, unknown> | undefined
    const name = text((structured?.mainText as Record<string, unknown> | undefined)?.text)
    // Query predictions carry no place id and cannot be resolved to an address.
    if (!id || !label || !isPlaceId(id)) continue
    out.push(name ? { id, suggestion: label, name } : { id, suggestion: label })
  }
  return out
}

export async function resolvePlaceId(
  apiKey: string,
  placeId: string,
  sessionToken: string | null,
  placeName: string | null = null,
): Promise<ShpLookupAddress | null> {
  const url = new URL(`${BASE}/places/${encodeURIComponent(placeId)}`)
  // Google takes the token as a query parameter on the details call, unlike the
  // autocomplete call where it is a body field.
  if (sessionToken) url.searchParams.set('sessionToken', sessionToken)

  const res = await fetch(url, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': DETAILS_MASK },
  })
  if (res.status === 404) return null
  if (!res.ok) throw await describeProviderFailure('Google Places details', res)
  const data = await res.json()
  const components: unknown = data?.addressComponents
  if (!Array.isArray(components)) return null
  return mapGoogleAddress(components.filter((c): c is GoogleAddressComponent => c != null && typeof c === 'object'), placeName)
}

export function createGoogleClient(apiKey: string, regionCodes: string[]): AlkProviderClient {
  return {
    isValidId: isPlaceId,
    autocomplete: (query, sessionToken) => autocompleteAddresses(apiKey, query, sessionToken, regionCodes),
    resolve: (id, sessionToken, placeName) => resolvePlaceId(apiKey, id, sessionToken, placeName),
  }
}
