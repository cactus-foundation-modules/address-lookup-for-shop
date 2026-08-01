// GET /api/m/address-lookup-for-shop/public/autocomplete?q=...
// Public proxy for Ideal Postcodes address autocomplete. The key never reaches
// the browser; the per-IP limiter keeps a scripted visitor from running up the
// per-lookup bill (a secondary guard - the client already debounces and holds
// off until three characters).
import { NextRequest, NextResponse } from 'next/server'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'
import { getSettings, resolveApiKey } from '@/modules/address-lookup-for-shop/lib/db/settings'
import { autocompleteAddresses } from '@/modules/address-lookup-for-shop/lib/ideal-postcodes'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 3 || q.length > 200) return NextResponse.json({ suggestions: [] })

  const ip = getClientIpFromRequest(request)
  if (!checkInMemoryRateLimit(`alk:autocomplete:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Too many lookups - slow down a little.' }, { status: 429 })
  }

  const settings = await getSettings()
  if (!settings.enabled) return NextResponse.json({ error: 'Address lookup is switched off.' }, { status: 503 })
  const { key } = await resolveApiKey()
  if (!key) return NextResponse.json({ error: 'Address lookup is not configured.' }, { status: 503 })

  try {
    const suggestions = await autocompleteAddresses(key, q)
    return NextResponse.json({ suggestions })
  } catch {
    // Provider trouble must never break checkout - the field degrades to a
    // plain input when suggestions stop coming.
    return NextResponse.json({ error: 'Address lookup is temporarily unavailable.' }, { status: 502 })
  }
}
