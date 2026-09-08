import { prisma } from '@/lib/db/prisma'
import { isAlkProvider, type AlkProvider, type AlkSettings } from '@/modules/address-lookup-for-shop/lib/types'
import { parseRegionCodes } from '@/modules/address-lookup-for-shop/lib/region-codes'

const FALLBACK: AlkSettings = {
  provider: 'ideal-postcodes',
  idealPostcodesKey: null,
  googleKey: null,
  googleRegionCodes: ['gb'],
  enabled: true,
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function mapRow(r: Record<string, unknown>): AlkSettings {
  return {
    provider: isAlkProvider(r.provider) ? r.provider : 'ideal-postcodes',
    idealPostcodesKey: nonEmpty(r.api_key),
    googleKey: nonEmpty(r.google_api_key),
    googleRegionCodes: parseRegionCodes(r.google_region_codes),
    enabled: r.enabled !== false,
  }
}

export async function getSettings(): Promise<AlkSettings> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "alk_settings" WHERE "id" = 'singleton' LIMIT 1
  `
  return rows[0] ? mapRow(rows[0]) : FALLBACK
}

export type AlkSettingsPatch = {
  provider?: AlkProvider
  idealPostcodesKey?: string | null
  googleKey?: string | null
  googleRegionCodes?: string
  enabled?: boolean
}

export async function updateSettings(input: AlkSettingsPatch): Promise<AlkSettings> {
  const current = await getSettings()
  // Each key is stored in its own column, so switching provider to try the
  // other one and switching back does not lose the first key.
  const next: AlkSettings = {
    provider: input.provider ?? current.provider,
    idealPostcodesKey: input.idealPostcodesKey !== undefined ? (input.idealPostcodesKey?.trim() || null) : current.idealPostcodesKey,
    googleKey: input.googleKey !== undefined ? (input.googleKey?.trim() || null) : current.googleKey,
    googleRegionCodes: input.googleRegionCodes !== undefined ? parseRegionCodes(input.googleRegionCodes) : current.googleRegionCodes,
    enabled: input.enabled ?? current.enabled,
  }
  await prisma.$executeRaw`
    INSERT INTO "alk_settings" ("id", "provider", "api_key", "google_api_key", "google_region_codes", "enabled", "updated_at")
    VALUES ('singleton', ${next.provider}, ${next.idealPostcodesKey}, ${next.googleKey}, ${next.googleRegionCodes.join(',')}, ${next.enabled}, NOW())
    ON CONFLICT ("id") DO UPDATE SET
      "provider" = EXCLUDED."provider",
      "api_key" = EXCLUDED."api_key",
      "google_api_key" = EXCLUDED."google_api_key",
      "google_region_codes" = EXCLUDED."google_region_codes",
      "enabled" = EXCLUDED."enabled",
      "updated_at" = NOW()
  `
  return next
}

// The environment variable that backs each provider up, so a key never has to
// be pasted twice on installs that already carry one.
const ENV_VAR: Record<AlkProvider, string> = {
  'ideal-postcodes': 'IDEAL_POSTCODES_KEY',
  google: 'GOOGLE_PLACES_API_KEY',
}

export type AlkKeyResolution = { key: string | null; source: 'settings' | 'env' | null }

// The key one provider would use: the per-install setting wins, its environment
// variable backs it up. Null means the module is installed but that provider is
// not yet usable - routes answer 503, the checkout field stays a plain input.
export function resolveKeyFor(settings: AlkSettings, provider: AlkProvider): AlkKeyResolution {
  const stored = provider === 'google' ? settings.googleKey : settings.idealPostcodesKey
  if (stored) return { key: stored, source: 'settings' }
  const envKey = process.env[ENV_VAR[provider]]?.trim()
  if (envKey) return { key: envKey, source: 'env' }
  return { key: null, source: null }
}

export async function resolveApiKey(): Promise<AlkKeyResolution & { provider: AlkProvider }> {
  const settings = await getSettings()
  return { ...resolveKeyFor(settings, settings.provider), provider: settings.provider }
}
