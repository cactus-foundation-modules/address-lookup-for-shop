import { describe, expect, it } from 'vitest'
import { deliveryCounty } from '@/modules/address-lookup-for-shop/lib/county'

describe('deliveryCounty', () => {
  it('drops Greater London, however it is cased or spaced', () => {
    expect(deliveryCounty('Greater London', 'London')).toBe('')
    expect(deliveryCounty('greater  london ', 'Bromley')).toBe('')
  })

  it('drops a county that only repeats the post town', () => {
    expect(deliveryCounty('London', 'London')).toBe('')
  })

  it('keeps every other county as given', () => {
    expect(deliveryCounty('South Yorkshire', 'Rotherham')).toBe('South Yorkshire')
    expect(deliveryCounty(' Somerset ', 'Bath')).toBe('Somerset')
  })

  it('leaves a missing county missing', () => {
    expect(deliveryCounty('', 'Bath')).toBe('')
  })
})
