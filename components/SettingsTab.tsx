'use client'

// Sub-tab of shop's settings tab, hosted through 'shop.settings-sub-tabs'.
// Shop lends the space and nothing else: own fetch, own save, own module API.
import { useCallback, useEffect, useState } from 'react'
import type { AlkKeyView, AlkProvider, AlkSettingsView } from '@/modules/address-lookup-for-shop/lib/types'

const BASE = '/api/m/address-lookup-for-shop/admin'

type Patch = {
  provider?: AlkProvider
  idealPostcodesKey?: string
  googleKey?: string
  googleRegionCodes?: string
  enabled?: boolean
}

const PROVIDERS: { id: AlkProvider; name: string; blurb: string }[] = [
  {
    id: 'ideal-postcodes',
    name: 'Ideal Postcodes',
    blurb: 'Royal Mail’s own address file, so flats and unit numbers are as good as they get. UK only. Typing costs nothing; you are charged a credit each time a shopper picks an address.',
  },
  {
    id: 'google',
    name: 'Google',
    blurb: 'Worldwide, and free up to a monthly allowance that a shop of ordinary size will not get near. Slightly less reliable on flats and sub-buildings than the Royal Mail file.',
  },
]

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

function keyStatusText(view: AlkKeyView): string {
  if (!view.hasKey) return 'No key yet.'
  if (view.keySource === 'env') return `Using the key from the site’s environment (ending ${view.keyHint}).`
  return `Key saved (ending ${view.keyHint}).`
}

export function AddressLookupSettingsTab() {
  const [settings, setSettings] = useState<AlkSettingsView | null>(null)
  const [idealDraft, setIdealDraft] = useState('')
  const [googleDraft, setGoogleDraft] = useState('')
  const [regionDraft, setRegionDraft] = useState<string | null>(null)
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

  async function save(patch: Patch) {
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
      if (patch.idealPostcodesKey !== undefined) setIdealDraft('')
      if (patch.googleKey !== undefined) setGoogleDraft('')
      if (patch.googleRegionCodes !== undefined) setRegionDraft(null)
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

  const view = settings
  const regionValue = regionDraft ?? view.googleRegionCodes.join(', ')

  function keyCard(provider: AlkProvider) {
    const meta = PROVIDERS.find((p) => p.id === provider)!
    const status = provider === 'google' ? view.google : view.idealPostcodes
    const draft = provider === 'google' ? googleDraft : idealDraft
    const setDraft = provider === 'google' ? setGoogleDraft : setIdealDraft
    const inUse = view.provider === provider
    const patchFor = (value: string): Patch => (provider === 'google' ? { googleKey: value } : { idealPostcodesKey: value })

    return (
      <section key={provider} style={card}>
        <h3 style={legend}>
          {meta.name} API key
          {!inUse && <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}> (not in use)</span>}
        </h3>
        <span style={hint}>{keyStatusText(status)}</span>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <input
            type="password"
            autoComplete="off"
            placeholder="Paste a new key"
            aria-label={`${meta.name} API key`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={inputStyle}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || draft.trim() === ''}
            onClick={() => void save(patchFor(draft.trim()))}
          >
            Save key
          </button>
          {status.keySource === 'settings' && (
            <button type="button" className="btn" disabled={saving} onClick={() => void save(patchFor(''))}>
              Remove key
            </button>
          )}
        </div>
        <span style={hint}>
          {provider === 'google'
            ? 'A Google Cloud key with the Places API switched on. The key stays on the server and is never sent to shoppers.'
            : 'Keys come from ideal-postcodes.co.uk. The key stays on the server and is never sent to shoppers.'}
        </span>
        {provider === 'google' && (
          <div style={{ marginTop: '0.875rem' }}>
            <label htmlFor="alk-regions" style={{ display: 'block', fontSize: '0.875rem', color: 'var(--color-text)' }}>
              Countries to suggest addresses in
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.375rem', flexWrap: 'wrap' }}>
              <input
                id="alk-regions"
                type="text"
                value={regionValue}
                placeholder="gb"
                onChange={(e) => setRegionDraft(e.target.value)}
                style={inputStyle}
              />
              <button
                type="button"
                className="btn"
                disabled={saving || regionDraft === null}
                onClick={() => void save({ googleRegionCodes: regionValue })}
              >
                Save countries
              </button>
            </div>
            <span style={hint}>Two-letter country codes, separated by commas. Leave it at gb for a UK-only shop. Fifteen at most.</span>
          </div>
        )}
      </section>
    )
  }

  return (
    <div>
      <section style={card}>
        <h3 style={legend}>Address lookup at checkout</h3>
        <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', cursor: 'pointer', marginTop: '0.75rem' }}>
          <input
            type="checkbox"
            checked={view.enabled}
            disabled={saving}
            onChange={(e) => void save({ enabled: e.target.checked })}
            style={{ marginTop: '0.2rem' }}
          />
          <span>
            <span style={{ display: 'block', color: 'var(--color-text)' }}>Suggest addresses as shoppers type</span>
            <span style={hint}>Switched off, checkout shows the ordinary address fields and nothing is looked up (or billed).</span>
          </span>
        </label>
        {view.enabled && !view.ready && (
          <p role="alert" style={{ ...hint, color: 'var(--color-danger)', marginTop: '0.75rem' }}>
            Nothing will be suggested until the chosen service below has a key.
          </p>
        )}
      </section>

      <section style={card}>
        <h3 style={legend}>Who does the looking up</h3>
        <span style={hint}>Both keys are kept, so you can try the other one and switch back without pasting anything again.</span>
        <div role="radiogroup" aria-label="Address lookup service" style={{ marginTop: '0.75rem', display: 'grid', gap: '0.75rem' }}>
          {PROVIDERS.map((p) => (
            <label key={p.id} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', cursor: 'pointer' }}>
              <input
                type="radio"
                name="alk-provider"
                checked={view.provider === p.id}
                disabled={saving}
                onChange={() => void save({ provider: p.id })}
                style={{ marginTop: '0.2rem' }}
              />
              <span>
                <span style={{ display: 'block', color: 'var(--color-text)' }}>{p.name}</span>
                <span style={hint}>{p.blurb}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {PROVIDERS.map((p) => keyCard(p.id))}

      {saved && <p style={{ color: 'var(--color-success, var(--color-text))', fontSize: '0.875rem' }}>Saved.</p>}
      {error && <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.875rem' }}>{error}</p>}
    </div>
  )
}
