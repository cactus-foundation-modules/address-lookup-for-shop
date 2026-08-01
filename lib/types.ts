export type AlkSettings = {
  // Never sent to the client in full - the admin settings view masks it.
  apiKey: string | null
  enabled: boolean
}

// What the admin settings tab sees: presence and a hint, never the key itself.
export type AlkSettingsView = {
  hasKey: boolean
  keyHint: string | null
  keySource: 'settings' | 'env' | null
  enabled: boolean
}

// Shape returned by the public autocomplete route.
export type AlkSuggestion = {
  id: number
  suggestion: string
}
