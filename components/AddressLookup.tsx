'use client'

// The checkout Address line 1 field with lookup layered on. Registered against
// shop's 'shop.checkout-address-lookup' extension point: shop still renders
// its own labelled input (via renderInput), this component adds the
// suggestions dropdown, keyboard handling and ARIA combobox wiring on top.
// Anything going wrong - key missing, provider down, shopper offline - leaves
// a perfectly ordinary text field behind.
import { useEffect, useRef, useState } from 'react'
import type { ShopCheckoutAddressLookupProps } from '@/modules/shop/components/public/checkout-address-lookup'
import type { AlkSuggestion } from '@/modules/address-lookup-for-shop/lib/types'

const BASE = '/api/m/address-lookup-for-shop/public'
const LISTBOX_ID = 'alk-address-suggestions'

export function AddressLookupField({ onSelect, renderInput }: ShopCheckoutAddressLookupProps) {
  const [suggestions, setSuggestions] = useState<AlkSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  // Latches shut on a 503 (switched off / no key) so an unconfigured install
  // never fires a request per keystroke for the whole checkout.
  const unavailable = useRef(false)
  const fetchSeq = useRef(0)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current) }, [])

  function close() {
    setOpen(false)
    setActiveIndex(-1)
  }

  // Driven by the shopper's keystrokes (React only fires onChange for user
  // input, so programmatically refilling the field after a pick never lands
  // here and cannot reopen the dropdown). Attached to the wrapper div and
  // caught on the bubble - shop's own input handler has already run.
  function handleChange(e: React.FormEvent<HTMLDivElement>) {
    if (debounce.current) clearTimeout(debounce.current)
    if (unavailable.current) return
    const target = e.target as HTMLInputElement
    const query = typeof target.value === 'string' ? target.value.trim() : ''
    const seq = ++fetchSeq.current
    if (query.length < 3) {
      setSuggestions([])
      close()
      return
    }
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`${BASE}/autocomplete?q=${encodeURIComponent(query)}`)
        if (res.status === 503) { unavailable.current = true; return }
        if (!res.ok) return
        const data = await res.json()
        if (seq !== fetchSeq.current) return
        const next: AlkSuggestion[] = Array.isArray(data.suggestions) ? data.suggestions : []
        setSuggestions(next)
        setOpen(next.length > 0)
        setActiveIndex(-1)
      } catch {
        // Network trouble: leave the field as a plain input.
      }
    }, 300)
  }

  async function pick(suggestion: AlkSuggestion) {
    close()
    try {
      const res = await fetch(`${BASE}/resolve?id=${suggestion.id}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.address) onSelect(data.address)
    } catch {
      // Pick fizzles quietly; whatever the shopper typed is still in the field.
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
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
    <div style={{ position: 'relative' }} onChange={handleChange} onKeyDown={onKeyDown} onBlur={close}>
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
        <ul
          id={LISTBOX_ID}
          role="listbox"
          aria-label="Address suggestions"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 20,
            margin: '0.25rem 0 0',
            padding: '0.25rem',
            listStyle: 'none',
            background: 'var(--color-surface-raised, var(--color-surface))',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            boxShadow: 'var(--shadow-md)',
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
      )}
    </div>
  )
}
