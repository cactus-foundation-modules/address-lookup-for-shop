// Two providers answer the same seam: Ideal Postcodes (Royal Mail PAF, UK only,
// a credit per resolved address) and Google Places (global, a free monthly
// allowance per SKU). The rest of the module is written against the provider
// interface in lib/providers, never against either one directly.
export const ALK_PROVIDERS = ['ideal-postcodes', 'google'] as const
export type AlkProvider = (typeof ALK_PROVIDERS)[number]

export function isAlkProvider(value: unknown): value is AlkProvider {
  return typeof value === 'string' && (ALK_PROVIDERS as readonly string[]).includes(value)
}

export type AlkSettings = {
  provider: AlkProvider
  // Never sent to the client in full - the admin settings view masks both.
  idealPostcodesKey: string | null
  googleKey: string | null
  // Two-letter country codes Google may suggest addresses from. Ideal Postcodes
  // is UK-only by nature and ignores this.
  googleRegionCodes: string[]
  enabled: boolean
}

// Presence and a hint for one key, never the key itself.
export type AlkKeyView = {
  hasKey: boolean
  keyHint: string | null
  keySource: 'settings' | 'env' | null
}

// What the admin settings tab sees.
export type AlkSettingsView = {
  provider: AlkProvider
  enabled: boolean
  idealPostcodes: AlkKeyView
  google: AlkKeyView
  googleRegionCodes: string[]
  // Whether the provider currently selected has a key to work with.
  ready: boolean
}

// Shape returned by the public autocomplete route. The id is opaque to the
// browser and only means anything to the provider that issued it: a UDPRN for
// Ideal Postcodes, a place id for Google.
export type AlkSuggestion = {
  id: string
  suggestion: string
}

// Google requires a "Powered by Google" credit wherever its suggestions appear
// outside a Google map, so the browser has to be told which provider answered.
export type AlkAutocompleteResponse = {
  suggestions: AlkSuggestion[]
  attribution: 'google' | null
}
