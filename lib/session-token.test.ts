import { describe, expect, it } from 'vitest'
import { makeSessionToken, normaliseSessionToken } from '@/modules/address-lookup-for-shop/lib/session-token'

describe('normaliseSessionToken', () => {
  it('accepts a UUID in either case', () => {
    const token = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
    expect(normaliseSessionToken(token)).toBe(token)
    expect(normaliseSessionToken(token.toUpperCase())).toBe(token.toUpperCase())
  })

  it('drops anything that is not one, rather than passing it to Google', () => {
    expect(normaliseSessionToken('')).toBeNull()
    expect(normaliseSessionToken('not-a-token')).toBeNull()
    expect(normaliseSessionToken('3f2504e0-4f89-41d3-9a0c-0305e82c3301x')).toBeNull()
    expect(normaliseSessionToken(null)).toBeNull()
    expect(normaliseSessionToken(undefined)).toBeNull()
  })
})

describe('makeSessionToken', () => {
  it('makes a token its own validator accepts', () => {
    const token = makeSessionToken()
    expect(normaliseSessionToken(token)).toBe(token)
  })

  it('does not repeat itself', () => {
    expect(makeSessionToken()).not.toBe(makeSessionToken())
  })
})
