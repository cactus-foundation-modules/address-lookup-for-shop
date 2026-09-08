// The contract every address provider implements. Kept deliberately small: two
// calls and an id check, so adding a third provider never reaches the routes or
// the checkout field.
import type { AlkSuggestion } from '@/modules/address-lookup-for-shop/lib/types'
import type { ShpLookupAddress } from '@/modules/shop/components/public/checkout-address-lookup'

export type AlkProviderClient = {
  // Rejects an id that could not have come from this provider, before it is
  // ever put in a URL. Ideal Postcodes issues numeric UDPRNs, Google issues
  // opaque place ids, so the check has to live with the provider rather than in
  // the route.
  isValidId(id: string): boolean
  // sessionToken is Google's billing grouping; Ideal Postcodes ignores it.
  autocomplete(query: string, sessionToken: string | null): Promise<AlkSuggestion[]>
  // placeName is the name shown against the suggestion the shopper picked, for
  // providers whose details call will not give it back cheaply. Optional by
  // nature: a provider that does not need it ignores it.
  resolve(id: string, sessionToken: string | null, placeName: string | null): Promise<ShpLookupAddress | null>
}
