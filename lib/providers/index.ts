// Turns the stored settings into the one provider client the routes should use.
// Everything provider-specific stops here.
import type { AlkProvider, AlkSettings } from '@/modules/address-lookup-for-shop/lib/types'
import type { AlkProviderClient } from '@/modules/address-lookup-for-shop/lib/providers/types'
import { createIdealPostcodesClient } from '@/modules/address-lookup-for-shop/lib/providers/ideal-postcodes'
import { createGoogleClient } from '@/modules/address-lookup-for-shop/lib/providers/google'
import { resolveKeyFor } from '@/modules/address-lookup-for-shop/lib/db/settings'

export type AlkActiveProvider = {
  provider: AlkProvider
  client: AlkProviderClient
}

export function createProviderClient(settings: AlkSettings, apiKey: string): AlkProviderClient {
  return settings.provider === 'google'
    ? createGoogleClient(apiKey, settings.googleRegionCodes)
    : createIdealPostcodesClient(apiKey)
}

// Null means the selected provider has no key, so nothing should be looked up.
export function resolveActiveProvider(settings: AlkSettings): AlkActiveProvider | null {
  const { key } = resolveKeyFor(settings, settings.provider)
  if (!key) return null
  return { provider: settings.provider, client: createProviderClient(settings, key) }
}
