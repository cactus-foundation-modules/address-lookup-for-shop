// GET/PATCH /api/m/address-lookup-for-shop/admin/settings
// Neither key ever travels back out - GET returns presence, source and a
// last-four hint for each provider.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getSettings, resolveKeyFor, updateSettings } from '@/modules/address-lookup-for-shop/lib/db/settings'
import { ALK_PROVIDERS, type AlkKeyView, type AlkProvider, type AlkSettings, type AlkSettingsView } from '@/modules/address-lookup-for-shop/lib/types'

function keyView(settings: AlkSettings, provider: AlkProvider): AlkKeyView {
  const { key, source } = resolveKeyFor(settings, provider)
  return { hasKey: key != null, keyHint: key ? `…${key.slice(-4)}` : null, keySource: source }
}

async function view(): Promise<AlkSettingsView> {
  const settings = await getSettings()
  const idealPostcodes = keyView(settings, 'ideal-postcodes')
  const google = keyView(settings, 'google')
  return {
    provider: settings.provider,
    enabled: settings.enabled,
    idealPostcodes,
    google,
    googleRegionCodes: settings.googleRegionCodes,
    ready: settings.provider === 'google' ? google.hasKey : idealPostcodes.hasKey,
  }
}

export async function GET() {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error
  return NextResponse.json({ settings: await view() })
}

const PatchBody = z.object({
  provider: z.enum(ALK_PROVIDERS).optional(),
  // Empty string clears the stored key (falling back to the env variable when
  // one is set); undefined leaves it alone.
  idealPostcodesKey: z.string().max(200).optional(),
  googleKey: z.string().max(200).optional(),
  // Free text; anything that is not a two-letter code is dropped on the way in.
  googleRegionCodes: z.string().max(200).optional(),
  enabled: z.boolean().optional(),
})

export async function PATCH(request: NextRequest) {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error
  const parsed = PatchBody.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid settings' }, { status: 400 })
  await updateSettings(parsed.data)
  return NextResponse.json({ settings: await view() })
}
