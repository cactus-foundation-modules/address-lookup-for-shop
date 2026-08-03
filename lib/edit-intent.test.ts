import { describe, expect, it } from 'vitest'
import { isShopperEdit, type AlkChangeContext } from '@/modules/address-lookup-for-shop/lib/edit-intent'

const NOW = 1_700_000_000_000

function ctx(overrides: Partial<AlkChangeContext> = {}): AlkChangeContext {
  return {
    focused: true,
    intent: { at: NOW - 5, inputType: 'insertText' },
    inputType: 'insertText',
    previousValue: '12 High Stree',
    nextValue: '12 High Street',
    now: NOW,
    ...overrides,
  }
}

describe('isShopperEdit', () => {
  it('accepts a typed character', () => {
    expect(isShopperEdit(ctx())).toBe(true)
  })

  it('accepts a deletion', () => {
    expect(isShopperEdit(ctx({
      intent: { at: NOW - 5, inputType: 'deleteContentBackward' },
      inputType: 'deleteContentBackward',
      previousValue: '12 High Street',
      nextValue: '12 High Stree',
    }))).toBe(true)
  })

  it('accepts a pasted address, however long', () => {
    expect(isShopperEdit(ctx({
      intent: { at: NOW - 5, inputType: 'insertFromPaste' },
      inputType: 'insertFromPaste',
      previousValue: '',
      nextValue: '12 High Street',
    }))).toBe(true)
  })

  it('accepts typing over a selected value', () => {
    expect(isShopperEdit(ctx({ previousValue: '12 High Street', nextValue: '9' }))).toBe(true)
  })

  // WebKit's autofill sets the value and dispatches an input event with an
  // empty inputType, having fired no beforeinput at all.
  it('rejects a Safari AutoFill of an unfocused field', () => {
    expect(isShopperEdit(ctx({
      focused: false,
      intent: { at: 0, inputType: '' },
      inputType: '',
      previousValue: '',
      nextValue: '12 High Street',
    }))).toBe(false)
  })

  it('rejects a Safari AutoFill of the focused field', () => {
    expect(isShopperEdit(ctx({
      intent: { at: 0, inputType: '' },
      inputType: '',
      previousValue: '',
      nextValue: '12 High Street',
    }))).toBe(false)
  })

  // The case the first attempt at this got wrong: the shopper types a couple of
  // characters, Safari offers their contact card, they tap it - all inside a
  // second of the last keystroke.
  it('rejects an AutoFill tapped moments after typing', () => {
    expect(isShopperEdit(ctx({
      intent: { at: 0, inputType: '' },
      inputType: '',
      previousValue: '12',
      nextValue: '12 High Street',
    }))).toBe(false)
  })

  it('rejects Chrome autofill, which labels itself a replacement', () => {
    expect(isShopperEdit(ctx({
      intent: { at: NOW - 5, inputType: 'insertReplacementText' },
      inputType: 'insertReplacementText',
      previousValue: '',
      nextValue: '12 High Street',
    }))).toBe(false)
  })

  it('rejects a whole address arriving in one insertText', () => {
    expect(isShopperEdit(ctx({ previousValue: '12', nextValue: '12 High Street' }))).toBe(false)
  })

  it('rejects a stale edit intent', () => {
    expect(isShopperEdit(ctx({ intent: { at: NOW - 5_000, inputType: 'insertText' } }))).toBe(false)
  })
})
