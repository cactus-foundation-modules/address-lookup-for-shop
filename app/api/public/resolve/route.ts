// GET /api/m/address-lookup-for-shop/public/resolve?id=...&session=...
// Turns a picked suggestion into a full address. Same guards as autocomplete.
// The id is opaque here - a UDPRN for Ideal Postcodes, a place id for Google -
// so the provider itself says whether it could have issued it.
import { NextRequest, NextResponse } from 'next/server'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'
import { getSettings } from '@/modules/address-lookup-for-shop/lib/db/settings'
import { resolveActiveProvider } from '@/modules/address-lookup-for-shop/lib/providers'
import { normaliseSessionToken } from '@/modules/address-lookup-for-shop/lib/session-token'

// The name shown against the suggestion, echoed back by the browser because
// the cheap tier of Google's details call will not return it. Shopper-supplied
// in the sense that anything reaching a public route is, but it lands in a
// field the shopper can type into freely anyway, so the only guard it needs is
// a sane length.
const MAX_PLACE_NAME = 120

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? ''
  const placeName = (request.nextUrl.searchParams.get('name') ?? '').trim().slice(0, MAX_PLACE_NAME) || null

  const ip = getClientIpFromRequest(request)
  if (!checkInMemoryRateLimit(`alk:resolve:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many lookups - slow down a little.' }, { status: 429 })
  }

  const settings = await getSettings()
  if (!settings.enabled) return NextResponse.json({ error: 'Address lookup is switched off.' }, { status: 503 })
  const active = resolveActiveProvider(settings)
  if (!active) return NextResponse.json({ error: 'Address lookup is not configured.' }, { status: 503 })

  if (!active.client.isValidId(id)) return NextResponse.json({ error: 'Invalid address id' }, { status: 400 })

  const sessionToken = normaliseSessionToken(request.nextUrl.searchParams.get('session'))

  try {
    const address = await active.client.resolve(id, sessionToken, placeName)
    if (!address) return NextResponse.json({ error: 'Address not found' }, { status: 404 })
    return NextResponse.json({ address })
  } catch (error) {
    // The provider's own words, to the server log only - see
    // lib/providers/provider-error.ts for why a bare 502 was not enough.
    console.error(`[address-lookup] resolve failed via ${active.provider}:`, error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Address lookup is temporarily unavailable.' }, { status: 502 })
  }
}
