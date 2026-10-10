'use client'

// Sub-tab of shop's settings tab, hosted through 'shop.settings-sub-tabs'.
// Shop lends the space and nothing else: own fetch, own save, own module API.
import { useCallback, useEffect, useState } from 'react'
import { SettingsHeaderActions, SettingsHeaderStatus } from '@/components/admin/SettingsHeaderActions'
import type { AlkKeyView, AlkProvider, AlkSettingsView } from '@/modules/address-lookup-for-shop/lib/types'
import { InfoTip } from '@/components/admin/InfoTip'

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
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
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

  async function runTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`${BASE}/test`, { method: 'POST' })
      const data = await res.json()
      setTestResult({ ok: data.ok === true, message: typeof data.message === 'string' ? data.message : 'No answer from the test.' })
    } catch {
      setTestResult({ ok: false, message: 'Could not run the test.' })
    } finally {
      setTesting(false)
    }
  }

  if (!settings) {
    return error
      ? <p role="alert" style={{ color: 'var(--color-danger)' }}>{error}</p>
      : <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
  }

  const view = settings
  const regionValue = regionDraft ?? view.googleRegionCodes.join(', ')
  // Everything typed and not yet saved goes up in one go. The switches and the
  // choice of service save themselves the moment they are touched.
  const pending: Patch = {
    ...(idealDraft.trim() !== '' ? { idealPostcodesKey: idealDraft.trim() } : {}),
    ...(googleDraft.trim() !== '' ? { googleKey: googleDraft.trim() } : {}),
    ...(regionDraft !== null ? { googleRegionCodes: regionValue } : {}),
  }
  const hasPending = Object.keys(pending).length > 0

  function keyCard(provider: AlkProvider) {
    const meta = PROVIDERS.find((p) => p.id === provider)!
    const status = provider === 'google' ? view.google : view.idealPostcodes
    const draft = provider === 'google' ? googleDraft : idealDraft
    const setDraft = provider === 'google' ? setGoogleDraft : setIdealDraft
    const inUse = view.provider === provider
    const patchFor = (value: string): Patch => (provider === 'google' ? { googleKey: value } : { idealPostcodesKey: value })

    return (
      <div key={provider} className="settings-group">
        <div className="field">
          <label htmlFor={`alk-key-${provider}`}>
            {meta.name} API key
            {!inUse && <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}> (not in use)</span>}
            <InfoTip>
              {provider === 'google'
                ? 'A Google Cloud key with the Places API switched on. The key stays on the server and is never sent to shoppers.'
                : 'Keys come from ideal-postcodes.co.uk. The key stays on the server and is never sent to shoppers.'}
            </InfoTip>
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              id={`alk-key-${provider}`}
              type="password"
              autoComplete="off"
              placeholder="Paste a new key"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            />
            {status.keySource === 'settings' && (
              <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void save(patchFor(''))}>
                Remove key
              </button>
            )}
          </div>
          <span className="field-hint">{keyStatusText(status)}</span>
        </div>
        {provider === 'google' && (
          <div className="field">
            <label htmlFor="alk-regions">Countries to suggest addresses in</label>
            <input
              id="alk-regions"
              type="text"
              value={regionValue}
              placeholder="gb"
              onChange={(e) => setRegionDraft(e.target.value)}
            />
            <span className="field-hint">Two-letter country codes, separated by commas. Leave it at gb for a UK-only shop. Fifteen at most.</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="settings-masonry">
      <SettingsHeaderActions>
        <SettingsHeaderStatus message={saved ? 'Saved' : null} error={error} />
        <button type="button" className="btn btn-primary" disabled={saving || !hasPending} onClick={() => void save(pending)}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </SettingsHeaderActions>
      <section className="card">
        <h3 className="card-title">
          Address lookup at checkout
          <InfoTip>Both keys are kept, so you can try the other service and switch back without pasting anything again.</InfoTip>
        </h3>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={view.enabled}
            disabled={saving}
            onChange={(e) => void save({ enabled: e.target.checked })}
          />
          Suggest addresses as shoppers type
          <InfoTip>Switched off, checkout shows the ordinary address fields and nothing is looked up (or billed).</InfoTip>
        </label>
        <div className="settings-group">
          <div>
            <button type="button" className="btn btn-secondary" disabled={testing || saving} onClick={() => void runTest()}>
              {testing ? 'Checking…' : 'Test the lookup'}
            </button>{' '}
            <InfoTip>Looks one address up, right now, with the service and key below. A key that has been rejected looks exactly like a working one from this screen, so it is worth asking.</InfoTip>
          </div>
          {testResult && (
            <p
              role="status"
              className="field-hint"
              style={{ color: testResult.ok ? 'var(--color-success, var(--color-text))' : 'var(--color-danger)' }}
            >
              {testResult.message}
            </p>
          )}
        </div>
        {view.enabled && !view.ready && (
          <div className="alert alert-warning" role="alert">
            Nothing will be suggested until the chosen service below has a key.
          </div>
        )}
        <div role="radiogroup" aria-label="Address lookup service" className="settings-fields">
          {PROVIDERS.map((p) => (
            <div key={p.id} className="settings-group">
              <label className="settings-check">
                <input
                  type="radio"
                  name="alk-provider"
                  checked={view.provider === p.id}
                  disabled={saving}
                  onChange={() => void save({ provider: p.id })}
                />
                Use {p.name}
              </label>
              <span className="field-hint">{p.blurb}</span>
            </div>
          ))}
        </div>
        <div className="settings-fields">
          {PROVIDERS.map((p) => keyCard(p.id))}
        </div>
      </section>
    </div>
  )
}
