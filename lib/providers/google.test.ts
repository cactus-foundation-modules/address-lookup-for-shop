import { describe, expect, it } from 'vitest'
import { isPlaceId, mapGoogleAddress, type GoogleAddressComponent } from '@/modules/address-lookup-for-shop/lib/providers/google'

function c(longText: string, ...types: string[]): GoogleAddressComponent {
  return { longText, shortText: longText, types }
}

const STREET = [c('12', 'street_number'), c('High Street', 'route')]
const AREA = [c('Bath', 'postal_town'), c('Somerset', 'administrative_area_level_2'), c('BA1 1AA', 'postal_code')]

describe('mapGoogleAddress', () => {
  it('puts a plain house and street on line 1 and leaves line 2 empty', () => {
    expect(mapGoogleAddress([...STREET, ...AREA])).toEqual({
      line1: '12 High Street',
      line2: '',
      city: 'Bath',
      county: 'Somerset',
      postcode: 'BA1 1AA',
    })
  })

  it('splits a flat the way PAF does - unit on line 1, street on line 2', () => {
    const address = mapGoogleAddress([c('Flat 3', 'subpremise'), ...STREET, ...AREA])
    expect(address?.line1).toBe('Flat 3')
    expect(address?.line2).toBe('12 High Street')
  })

  it('joins a unit and a building name onto line 1', () => {
    const address = mapGoogleAddress([c('Flat 3', 'subpremise'), c('Rowan House', 'premise'), ...STREET])
    expect(address?.line1).toBe('Flat 3, Rowan House')
    expect(address?.line2).toBe('12 High Street')
  })

  it('falls back to the building name when there is no street', () => {
    const address = mapGoogleAddress([c('Rowan House', 'premise'), ...AREA])
    expect(address?.line1).toBe('Rowan House')
    expect(address?.line2).toBe('')
  })

  it('uses locality as the town when Google publishes no post town', () => {
    const address = mapGoogleAddress([...STREET, c('Ballymena', 'locality')])
    expect(address?.city).toBe('Ballymena')
  })

  it('never treats the UK nation as a county', () => {
    const address = mapGoogleAddress([...STREET, c('England', 'administrative_area_level_1')])
    expect(address?.county).toBe('')
  })

  it('trims the component text', () => {
    const address = mapGoogleAddress([{ longText: '  12  ', types: ['street_number'] }, c('High Street', 'route')])
    expect(address?.line1).toBe('12 High Street')
  })

  it('returns null when nothing addressable came back', () => {
    expect(mapGoogleAddress([c('United Kingdom', 'country')])).toBeNull()
    expect(mapGoogleAddress([])).toBeNull()
  })

  it('ignores components with no usable text', () => {
    expect(mapGoogleAddress([{ longText: 42, types: ['route'] }])).toBeNull()
  })
})

describe('mapGoogleAddress with the picked place name', () => {
  // Google keeps an establishment's name out of addressComponents entirely.
  // "Blackwall Basin Moorings" comes back as a bare 1 Myers Walk, which is a
  // street the shopper has never heard of replacing the name they typed.
  it('puts an establishment name on line 1 and its street on line 2', () => {
    const address = mapGoogleAddress([...STREET, ...AREA], 'Blackwall Basin Moorings')
    expect(address?.line1).toBe('Blackwall Basin Moorings')
    expect(address?.line2).toBe('12 High Street')
  })

  it('ignores a name that is only the street again', () => {
    const address = mapGoogleAddress([...STREET, ...AREA], '12 High Street')
    expect(address?.line1).toBe('12 High Street')
    expect(address?.line2).toBe('')
  })

  it('compares the name to the street past case and punctuation', () => {
    const address = mapGoogleAddress([...STREET], '12  high street,')
    expect(address?.line1).toBe('12 High Street')
    expect(address?.line2).toBe('')
  })

  it('keeps a flat number ahead of the building it is in', () => {
    const address = mapGoogleAddress([c('Flat 3', 'subpremise'), ...STREET], 'Rowan House')
    expect(address?.line1).toBe('Flat 3, Rowan House')
    expect(address?.line2).toBe('12 High Street')
  })

  it('does not repeat a name the components already gave', () => {
    const address = mapGoogleAddress([c('Rowan House', 'premise'), ...STREET], 'Rowan House')
    expect(address?.line1).toBe('Rowan House')
    expect(address?.line2).toBe('12 High Street')
  })

  it('still returns null when the name is all there is', () => {
    expect(mapGoogleAddress([], 'Blackwall Basin Moorings')?.line1).toBe('Blackwall Basin Moorings')
    expect(mapGoogleAddress([], '')).toBeNull()
  })
})

describe('isPlaceId', () => {
  it('accepts the ids Google issues', () => {
    expect(isPlaceId('ChIJj61dQgK6j4AR4GeTYWZsKWw')).toBe(true)
    expect(isPlaceId('Ei0xMiBIaWdoIFN0-_')).toBe(true)
  })

  it('rejects anything that could reshape the request path', () => {
    expect(isPlaceId('')).toBe(false)
    expect(isPlaceId('../../places')).toBe(false)
    expect(isPlaceId('abc/def')).toBe(false)
    expect(isPlaceId('abc?fields=all')).toBe(false)
    expect(isPlaceId('a'.repeat(513))).toBe(false)
  })
})
