import { describe, expect, it } from 'vitest'
import { parseRegionCodes } from '@/modules/address-lookup-for-shop/lib/region-codes'

describe('parseRegionCodes', () => {
  it('reads a single code', () => {
    expect(parseRegionCodes('gb')).toEqual(['gb'])
  })

  it('lower-cases and accepts commas or spaces', () => {
    expect(parseRegionCodes('GB, IE')).toEqual(['gb', 'ie'])
    expect(parseRegionCodes('gb ie')).toEqual(['gb', 'ie'])
  })

  it('drops duplicates', () => {
    expect(parseRegionCodes('gb, GB, ie')).toEqual(['gb', 'ie'])
  })

  it('drops anything that is not a two-letter code', () => {
    expect(parseRegionCodes('gb, united kingdom, 44, i')).toEqual(['gb'])
  })

  it('stops at fifteen, which is all Google accepts', () => {
    const codes = 'aa ab ac ad ae af ag ah ai aj ak al am an ao ap aq'
    expect(parseRegionCodes(codes)).toHaveLength(15)
  })

  it('treats a missing or non-string value as none', () => {
    expect(parseRegionCodes(null)).toEqual([])
    expect(parseRegionCodes(undefined)).toEqual([])
    expect(parseRegionCodes('')).toEqual([])
  })
})
