// GET /api/m/address-lookup-for-shop/public/resolve?id=...&session=...
// Turns a picked suggestion into a full address. Same guards as autocomplete.
// The id is opaque here - a UDPRN for Ideal Postcodes, a place id for Google -
// so the provider itself says whether it could have issued it.
import { NextRequest, NextResponse } from 'next/server'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'
import { getSettings } from '@/modules/address-lookup-for-shop/lib/db/settings'
import { resolveActiveProvider } from '@/modules/address-lookup-for-shop/lib/providers'
import { normaliseSessionToken } from '@/modules/address-lookup-for-shop/lib/session-token'

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? ''

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
    const address = await active.client.resolve(id, sessionToken)
    if (!address) return NextResponse.json({ error: 'Address not found' }, { status: 404 })
    return NextResponse.json({ address })
  } catch {
    return NextResponse.json({ error: 'Address lookup is temporarily unavailable.' }, { status: 502 })
  }
}
