import { prisma } from '@/lib/db/prisma'
import type { AlkSettings } from '@/modules/address-lookup-for-shop/lib/types'

const FALLBACK: AlkSettings = { apiKey: null, enabled: true }

function mapRow(r: Record<string, unknown>): AlkSettings {
  const key = typeof r.api_key === 'string' && r.api_key.trim() !== '' ? r.api_key : null
  return { apiKey: key, enabled: r.enabled !== false }
}

export async function getSettings(): Promise<AlkSettings> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "alk_settings" WHERE "id" = 'singleton' LIMIT 1
  `
  return rows[0] ? mapRow(rows[0]) : FALLBACK
}

export async function updateSettings(input: { apiKey?: string | null; enabled?: boolean }): Promise<AlkSettings> {
  const current = await getSettings()
  const next: AlkSettings = {
    apiKey: input.apiKey !== undefined ? (input.apiKey?.trim() || null) : current.apiKey,
    enabled: input.enabled ?? current.enabled,
  }
  await prisma.$executeRaw`
    INSERT INTO "alk_settings" ("id", "api_key", "enabled", "updated_at")
    VALUES ('singleton', ${next.apiKey}, ${next.enabled}, NOW())
    ON CONFLICT ("id") DO UPDATE SET
      "api_key" = EXCLUDED."api_key",
      "enabled" = EXCLUDED."enabled",
      "updated_at" = NOW()
  `
  return next
}

// The key the lookup routes actually use: the per-install setting wins, the
// IDEAL_POSTCODES_KEY environment variable backs it up. Null means the module
// is installed but not yet usable - routes answer 503, the checkout field
// stays a plain input.
export async function resolveApiKey(): Promise<{ key: string | null; source: 'settings' | 'env' | null }> {
  const settings = await getSettings()
  if (settings.apiKey) return { key: settings.apiKey, source: 'settings' }
  const envKey = process.env.IDEAL_POSTCODES_KEY?.trim()
  if (envKey) return { key: envKey, source: 'env' }
  return { key: null, source: null }
}
