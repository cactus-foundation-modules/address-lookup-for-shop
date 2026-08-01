'use client'

// Sub-tab of shop's settings tab, hosted through 'shop.settings-sub-tabs'.
// Shop lends the space and nothing else: own fetch, own save, own module API.
import { useCallback, useEffect, useState } from 'react'
import type { AlkSettingsView } from '@/modules/address-lookup-for-shop/lib/types'

const BASE = '/api/m/address-lookup-for-shop/admin'

const card = {
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  padding: '1rem 1.25rem',
  background: 'var(--color-surface)',
  marginBottom: '1.25rem',
} as const

const legend = { fontSize: '0.9375rem', fontWeight: 600, margin: '0 0 0.25rem' } as const
const hint = { display: 'block', fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' } as const
const inputStyle = {
  font: 'inherit',
  fontSize: '0.875rem',
  padding: '0.5rem 0.625rem',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  background: 'var(--color-bg)',
  color: 'var(--color-fg)',
  maxWidth: 420,
  width: '100%',
} as const

export function AddressLookupSettingsTab() {
  const [settings, setSettings] = useState<AlkSettingsView | null>(null)
  const [keyDraft, setKeyDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/settings`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSettings(data.settings)
    } catch {
      setError('Could not load the address lookup settings.')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    // Yield a microtask first so the opening setState never runs synchronously
    // inside the effect.
    void (async () => {
      await Promise.resolve()
      if (!cancelled) await load()
    })()
    return () => { cancelled = true }
  }, [load])

  async function save(patch: { apiKey?: string; enabled?: boolean }) {
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const res = await fetch(`${BASE}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setSettings(data.settings)
      setKeyDraft('')
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!settings) {
    return error
      ? <p role="alert" style={{ color: 'var(--color-danger)' }}>{error}</p>
      : <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
  }

  const keyStatus = !settings.hasKey
    ? 'No key yet - lookups stay off until one is entered.'
    : settings.keySource === 'env'
      ? `Using the key from the site's environment (ending ${settings.keyHint}).`
      : `Key saved (ending ${settings.keyHint}).`

  return (
    <div>
      <section style={card}>
        <h3 style={legend}>Address lookup at checkout</h3>
        <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', cursor: 'pointer', marginTop: '0.75rem' }}>
          <input
            type="checkbox"
            checked={settings.enabled}
            disabled={saving}
            onChange={(e) => void save({ enabled: e.target.checked })}
            style={{ marginTop: '0.2rem' }}
          />
          <span>
            <span style={{ display: 'block', color: 'var(--color-text)' }}>Suggest addresses as shoppers type</span>
            <span style={hint}>Switched off, checkout shows the ordinary address fields and nothing is looked up (or billed).</span>
          </span>
        </label>
      </section>

      <section style={card}>
        <h3 style={legend}>Ideal Postcodes API key</h3>
        <span style={hint}>{keyStatus}</span>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <input
            type="password"
            autoComplete="off"
            placeholder="Paste a new key"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            style={inputStyle}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || keyDraft.trim() === ''}
            onClick={() => void save({ apiKey: keyDraft.trim() })}
          >
            Save key
          </button>
          {settings.keySource === 'settings' && (
            <button type="button" className="btn" disabled={saving} onClick={() => void save({ apiKey: '' })}>
              Remove key
            </button>
          )}
        </div>
        <span style={hint}>Keys come from ideal-postcodes.co.uk - they charge per lookup, so the key stays on the server and shoppers only trigger a lookup once they have typed three characters.</span>
      </section>

      {saved && <p style={{ color: 'var(--color-success, var(--color-text))', fontSize: '0.875rem' }}>Saved.</p>}
      {error && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>{error}</p>}
    </div>
  )
}
