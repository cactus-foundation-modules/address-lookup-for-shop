'use client'

// The checkout Address line 1 field with lookup layered on. Registered against
// shop's 'shop.checkout-address-lookup' extension point: shop still renders
// its own labelled input (via renderInput), this component adds the
// suggestions dropdown, keyboard handling and ARIA combobox wiring on top.
// Anything going wrong - key missing, provider down, shopper offline - leaves
// a perfectly ordinary text field behind.
import { useEffect, useId, useRef, useState } from 'react'
import type { ShopCheckoutAddressLookupProps } from '@/modules/shop/components/public/checkout-address-lookup'
import type { AlkSuggestion } from '@/modules/address-lookup-for-shop/lib/types'
import { isShopperEdit, type AlkEditIntent } from '@/modules/address-lookup-for-shop/lib/edit-intent'
import { makeSessionToken } from '@/modules/address-lookup-for-shop/lib/session-token'

const BASE = '/api/m/address-lookup-for-shop/public'
const NO_INTENT: AlkEditIntent = { at: 0, inputType: '' }

export function AddressLookupField({ onSelect, renderInput }: ShopCheckoutAddressLookupProps) {
  // Per instance, not a constant: a checkout that asks for a billing address as
  // well as a delivery one puts two of these on the same page, and a shared id
  // would have both inputs pointing their aria-controls at whichever listbox
  // the browser found first.
  const LISTBOX_ID = useId()
  const [suggestions, setSuggestions] = useState<AlkSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  // Which provider answered, so Google's suggestions can carry the credit its
  // terms require. Only read while suggestions are on screen, so it never
  // needs clearing.
  const [attribution, setAttribution] = useState<'google' | null>(null)
  // Latches shut on a 503 (switched off / no key) so an unconfigured install
  // never fires a request per keystroke for the whole checkout.
  const unavailable = useRef(false)
  // Google bills a run of keystrokes plus the one details call that follows as
  // a single session, keyed by this token. Minted on the first lookup and torn
  // up after a pick, which is what Google asks for.
  const sessionToken = useRef<string | null>(null)
  const fetchSeq = useRef(0)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapper = useRef<HTMLDivElement | null>(null)
  // Stamped by the native beforeinput event, which fires for the shopper's own
  // editing and not for a value the browser fills in for them. Consumed by the
  // next change (see lib/edit-intent.ts for the whole argument).
  const editIntent = useRef<AlkEditIntent>(NO_INTENT)
  // The field's value as this component last saw it. Kept here rather than read
  // off the value prop, which is a render behind and would call the second of
  // two input events for one fill a no-op edit.
  const seenValue = useRef('')
  // Latched by any change this component cannot put down to the shopper, and
  // cleared only by a keydown in the field.
  const filled = useRef(false)

  // Diagnostics, off unless the checkout URL carries ?alkdebug=1. Telling a
  // shopper's own browser apart from a filler is guesswork from the outside, so
  // this prints the events the field actually receives on the device in front
  // of you - phones have no console worth the name, hence a panel on the page.
  // Nothing leaves the browser.
  const [debugLines, setDebugLines] = useState<string[] | null>(null)
  const debugOn = useRef<boolean | null>(null)
  function trace(line: string) {
    if (debugOn.current === null) {
      debugOn.current = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('alkdebug')
    }
    if (!debugOn.current) return
    setDebugLines((lines) => [...(lines ?? []).slice(-14), line])
  }

  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current) }, [])

  // A native listener rather than a React prop: React's onBeforeInput is its
  // own synthetic affair, and this needs the browser's actual beforeinput.
  useEffect(() => {
    const node = wrapper.current
    if (!node) return
    function stamp(e: Event) {
      const inputType = (e as InputEvent).inputType
      // e.timeStamp, not Date.now: the change event is compared against this
      // and both come off the same event clock.
      editIntent.current = { at: e.timeStamp, inputType: typeof inputType === 'string' ? inputType : '' }
      trace(`beforeinput type="${editIntent.current.inputType || '(none)'}"`)
    }
    node.addEventListener('beforeinput', stamp)
    return () => node.removeEventListener('beforeinput', stamp)
  }, [])

  // Reaching the field afresh: take its current value as the baseline, so the
  // first edit is measured against what is actually in the box.
  function onFocus(e: React.FocusEvent<HTMLDivElement>) {
    const target = e.target as HTMLInputElement
    seenValue.current = typeof target.value === 'string' ? target.value : ''
    trace(`focus - baseline ${seenValue.current.length} chars`)
  }

  function close() {
    setOpen(false)
    setActiveIndex(-1)
  }

  function shopperTyped(e: React.FormEvent<HTMLDivElement>, target: HTMLInputElement, now: number) {
    const intent = editIntent.current
    editIntent.current = NO_INTENT
    const native = e.nativeEvent as Partial<InputEvent>
    const nextValue = typeof target.value === 'string' ? target.value : ''
    const previousValue = seenValue.current
    seenValue.current = nextValue
    const verdict = isShopperEdit({
      focused: typeof document !== 'undefined' && document.activeElement === target,
      intent,
      inputType: typeof native?.inputType === 'string' ? native.inputType : '',
      previousValue,
      nextValue,
      filled: filled.current,
      now,
    })
    // Anything unaccounted for latches lookups off until a key is pressed in
    // the field, so a browser doing something none of the checks predicted
    // cannot keep sneaking through one event after another.
    if (!verdict) filled.current = true
    trace(
      `change type="${(typeof native?.inputType === 'string' ? native.inputType : '') || '(none)'}"`
      + ` intent="${intent.at ? intent.inputType || '(none)' : 'none'}"`
      + ` focus=${typeof document !== 'undefined' && document.activeElement === target}`
      + ` len ${previousValue.length}->${nextValue.length}`
      + ` => ${verdict ? 'LOOKUP' : 'ignored'}`,
    )
    return verdict
  }

  // Driven by the shopper's keystrokes (React only fires onChange for user
  // input, so programmatically refilling the field after a pick never lands
  // here and cannot reopen the dropdown). Attached to the wrapper div and
  // caught on the bubble - shop's own input handler has already run.
  function handleChange(e: React.FormEvent<HTMLDivElement>) {
    const now = e.timeStamp
    if (debounce.current) clearTimeout(debounce.current)
    if (unavailable.current) return
    const target = e.target as HTMLInputElement
    const query = typeof target.value === 'string' ? target.value.trim() : ''
    const seq = ++fetchSeq.current
    // An autofilled line 1 leaves a plain field behind, and drops any list
    // already showing - the address it was suggesting has just been replaced.
    if (!shopperTyped(e, target, now)) {
      setSuggestions([])
      close()
      return
    }
    if (query.length < 3) {
      setSuggestions([])
      close()
      return
    }
    debounce.current = setTimeout(async () => {
      try {
        if (!sessionToken.current) sessionToken.current = makeSessionToken()
        const res = await fetch(`${BASE}/autocomplete?q=${encodeURIComponent(query)}&session=${sessionToken.current}`)
        if (res.status === 503) { unavailable.current = true; return }
        if (!res.ok) return
        const data = await res.json()
        if (seq !== fetchSeq.current) return
        const next: AlkSuggestion[] = Array.isArray(data.suggestions) ? data.suggestions : []
        setSuggestions(next)
        setAttribution(data.attribution === 'google' ? 'google' : null)
        setOpen(next.length > 0)
        setActiveIndex(-1)
      } catch {
        // Network trouble: leave the field as a plain input.
      }
    }, 300)
  }

  async function pick(suggestion: AlkSuggestion) {
    close()
    // The details call has to carry the same token as the keystrokes that led
    // to it, and the session ends here either way: whatever happens next starts
    // a fresh one.
    const token = sessionToken.current
    sessionToken.current = null
    try {
      const session = token ? `&session=${token}` : ''
      const res = await fetch(`${BASE}/resolve?id=${encodeURIComponent(suggestion.id)}${session}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.address) {
        // Shop refills the field from this, without an input event, so the
        // baseline has to be moved by hand or the shopper's next keystroke
        // looks like a fill arriving whole.
        seenValue.current = typeof data.address.line1 === 'string' ? data.address.line1 : ''
        onSelect(data.address)
      }
    } catch {
      // Pick fizzles quietly; whatever the shopper typed is still in the field.
    }
  }

  // A keydown is the one thing no autofill produces, so it is what lifts the
  // latch: press a key in the field and suggestions are welcome again.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    filled.current = false
    trace(`keydown ${e.key} - latch cleared`)
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      const active = activeIndex >= 0 ? suggestions[activeIndex] : undefined
      if (active) {
        e.preventDefault()
        void pick(active)
      }
    } else if (e.key === 'Escape') {
      close()
    }
  }

  return (
    // Behaviour rides the bubble phase on this wrapper rather than being
    // injected as input handlers: shop's input keeps its own handlers, and the
    // hooks lint accepts ref-touching callbacks only as JSX event props.
    <div ref={wrapper} style={{ position: 'relative' }} onChange={handleChange} onKeyDown={onKeyDown} onFocus={onFocus} onBlur={close}>
      {renderInput({
        role: 'combobox',
        'aria-expanded': open,
        'aria-controls': LISTBOX_ID,
        'aria-activedescendant': activeIndex >= 0 ? `${LISTBOX_ID}-${activeIndex}` : undefined,
        'aria-autocomplete': 'list',
        // The browser's own address autofill panel sits exactly where the
        // suggestions do; the field still carries autofill semantics for
        // password-manager style fillers via the surrounding form.
        autoComplete: 'off',
      })}
      {open && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 20,
            marginTop: '0.25rem',
            background: 'var(--color-surface-raised, var(--color-surface))',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            boxShadow: 'var(--shadow-md)',
            overflow: 'hidden',
          }}
        >
          <ul
            id={LISTBOX_ID}
            role="listbox"
            aria-label="Address suggestions"
            style={{
              margin: 0,
              padding: '0.25rem',
              listStyle: 'none',
              maxHeight: '16rem',
              overflowY: 'auto',
            }}
          >
            {suggestions.map((s, i) => (
              <li
                key={s.id}
                id={`${LISTBOX_ID}-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                // mousedown, not click: click lands after the input's blur has
                // already closed the list.
                onMouseDown={(e) => { e.preventDefault(); void pick(s) }}
                onMouseEnter={() => setActiveIndex(i)}
                style={{
                  padding: '0.5rem 0.625rem',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  color: 'var(--color-text)',
                  background: i === activeIndex ? 'var(--color-bg-subtle)' : 'transparent',
                }}
              >
                {s.suggestion}
              </li>
            ))}
          </ul>
          {attribution === 'google' && (
            // Google's terms require the "Powered by Google" credit wherever its
            // suggestions appear away from a Google map. The strip is white by
            // hand rather than by token because Google publishes one logo per
            // background and this is the on-white one - a themed surface would
            // put it on the wrong colour half the time.
            <div style={{ background: '#fff', padding: '0.3125rem 0.625rem', textAlign: 'right' }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- next/image would need maps.gstatic.com in core's remotePatterns, which is module-specific config core may not carry; this is a fixed-size remote brand asset. */}
              <img
                src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png"
                alt="Powered by Google"
                width={144}
                height={18}
                style={{ display: 'inline-block', width: 'auto', height: 18 }}
              />
            </div>
          )}
        </div>
      )}
      {debugLines && (
        <pre
          aria-hidden="true"
          style={{
            margin: '0.5rem 0 0',
            padding: '0.5rem',
            border: '1px dashed var(--color-border)',
            borderRadius: 6,
            background: 'var(--color-bg-subtle)',
            color: 'var(--color-text-muted)',
            fontSize: '0.6875rem',
            lineHeight: 1.4,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {debugLines.length === 0 ? 'address lookup: waiting for events' : debugLines.join('\n')}
        </pre>
      )}
    </div>
  )
}
