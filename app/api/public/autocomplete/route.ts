// GET /api/m/address-lookup-for-shop/public/autocomplete?q=...&session=...
// Public proxy for whichever address provider the shop has configured. The key
// never reaches the browser; the per-IP limiter keeps a scripted visitor from
// running up the bill (a secondary guard - the client already debounces and
// holds off until three characters).
import { NextRequest, NextResponse } from 'next/server'
import { checkInMemoryRateLimit, getClientIpFromRequest } from '@/modules/shop/lib/rate-limit'
import { getSettings } from '@/modules/address-lookup-for-shop/lib/db/settings'
import { resolveActiveProvider } from '@/modules/address-lookup-for-shop/lib/providers'
import { normaliseSessionToken } from '@/modules/address-lookup-for-shop/lib/session-token'
import type { AlkAutocompleteResponse } from '@/modules/address-lookup-for-shop/lib/types'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  const empty: AlkAutocompleteResponse = { suggestions: [], attribution: null }
  if (q.length < 3 || q.length > 200) return NextResponse.json(empty)

  const ip = getClientIpFromRequest(request)
  if (!checkInMemoryRateLimit(`alk:autocomplete:${ip}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Too many lookups - slow down a little.' }, { status: 429 })
  }

  const settings = await getSettings()
  if (!settings.enabled) return NextResponse.json({ error: 'Address lookup is switched off.' }, { status: 503 })
  const active = resolveActiveProvider(settings)
  if (!active) return NextResponse.json({ error: 'Address lookup is not configured.' }, { status: 503 })

  const sessionToken = normaliseSessionToken(request.nextUrl.searchParams.get('session'))

  try {
    const suggestions = await active.client.autocomplete(q, sessionToken)
    // Google requires its credit wherever suggestions appear outside a Google
    // map, so the browser is told which provider answered.
    const body: AlkAutocompleteResponse = {
      suggestions,
      attribution: active.provider === 'google' ? 'google' : null,
    }
    return NextResponse.json(body)
  } catch {
    // Provider trouble must never break checkout - the field degrades to a
    // plain input when suggestions stop coming.
    return NextResponse.json({ error: 'Address lookup is temporarily unavailable.' }, { status: 502 })
  }
}
