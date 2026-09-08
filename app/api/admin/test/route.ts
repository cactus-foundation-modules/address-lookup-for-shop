// POST /api/m/address-lookup-for-shop/admin/test
// Runs one real autocomplete against the configured provider and reports what
// it said. Admin-only and permission-gated, which is what makes it safe to pass
// the provider's own words back: the public route must never do that, but the
// person who pasted the key is exactly who needs to read them.
//
// This exists because a rejected key looks identical to a working one from the
// settings screen, and identical to a provider outage from the checkout: both
// produce a 502 and a field that quietly stops suggesting. Reading it off the
// server log means having access to the server log.
import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getSettings } from '@/modules/address-lookup-for-shop/lib/db/settings'
import { resolveActiveProvider } from '@/modules/address-lookup-for-shop/lib/providers'

// Deliberately ordinary and deliberately not UK-specific. The question is
// whether the provider answers at all, not whether this particular street
// exists in whichever countries the shop has named.
const PROBE = '1 High Street'

export async function POST() {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error

  const settings = await getSettings()
  const active = resolveActiveProvider(settings)
  if (!active) {
    return NextResponse.json({ ok: false, message: 'No key is saved for the service you have chosen.' })
  }

  try {
    const suggestions = await active.client.autocomplete(PROBE, null)
    return NextResponse.json({
      ok: true,
      message: suggestions.length > 0
        ? `Working. ${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'} came back for "${PROBE}".`
        : `Working. The key was accepted, though "${PROBE}" matched nothing in the countries you have set.`,
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      message: error instanceof Error ? error.message : 'The lookup service could not be reached.',
    })
  }
}
