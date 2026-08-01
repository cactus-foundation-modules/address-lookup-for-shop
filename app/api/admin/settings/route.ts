// GET/PATCH /api/m/address-lookup-for-shop/admin/settings
// The key itself never travels back out - GET returns presence, source and a
// last-four hint only.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getSettings, resolveApiKey, updateSettings } from '@/modules/address-lookup-for-shop/lib/db/settings'
import type { AlkSettingsView } from '@/modules/address-lookup-for-shop/lib/types'

async function view(): Promise<AlkSettingsView> {
  const settings = await getSettings()
  const { key, source } = await resolveApiKey()
  return {
    hasKey: key != null,
    keyHint: key ? `…${key.slice(-4)}` : null,
    keySource: source,
    enabled: settings.enabled,
  }
}

export async function GET() {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error
  return NextResponse.json({ settings: await view() })
}

const PatchBody = z.object({
  // Empty string clears the stored key (falling back to the env variable when
  // one is set); undefined leaves it alone.
  apiKey: z.string().max(200).optional(),
  enabled: z.boolean().optional(),
})

export async function PATCH(request: NextRequest) {
  const gate = await requireShopUser('shop.manage')
  if (gate.error) return gate.error
  const parsed = PatchBody.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid settings' }, { status: 400 })
  await updateSettings({ apiKey: parsed.data.apiKey ?? undefined, enabled: parsed.data.enabled })
  return NextResponse.json({ settings: await view() })
}
