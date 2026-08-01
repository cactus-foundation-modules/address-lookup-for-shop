// GET /api/m/address-lookup-for-shop/public/resolve?id=<udprn>
// Turns a picked suggestion into a full address. Same guards as autocomplete.
import { NextRequest, NextResponse } from 'next/server'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'
import { getSettings, resolveApiKey } from '@/modules/address-lookup-for-shop/lib/db/settings'
import { resolveUdprn } from '@/modules/address-lookup-for-shop/lib/ideal-postcodes'

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('id') ?? ''
  const udprn = Number.parseInt(raw, 10)
  if (!Number.isInteger(udprn) || udprn <= 0 || String(udprn) !== raw) {
    return NextResponse.json({ error: 'Invalid address id' }, { status: 400 })
  }

  const ip = getClientIpFromRequest(request)
  if (!checkInMemoryRateLimit(`alk:resolve:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many lookups - slow down a little.' }, { status: 429 })
  }

  const settings = await getSettings()
  if (!settings.enabled) return NextResponse.json({ error: 'Address lookup is switched off.' }, { status: 503 })
  const { key } = await resolveApiKey()
  if (!key) return NextResponse.json({ error: 'Address lookup is not configured.' }, { status: 503 })

  try {
    const address = await resolveUdprn(key, udprn)
    if (!address) return NextResponse.json({ error: 'Address not found' }, { status: 404 })
    return NextResponse.json({ address })
  } catch {
    return NextResponse.json({ error: 'Address lookup is temporarily unavailable.' }, { status: 502 })
  }
}
