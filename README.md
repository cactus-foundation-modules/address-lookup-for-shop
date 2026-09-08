<p align="center">
  <img src="module-art.webp" alt="Address Lookup for Shop" width="640" />
</p>

# Address Lookup for Shop

Checkout address lookup for the Cactus shop module, via [Ideal Postcodes](https://ideal-postcodes.co.uk) or [Google Places](https://developers.google.com/maps/documentation/places/web-service/overview).

Shoppers type the first line of their address into the ordinary Address line 1 field; suggestions appear as they type, and picking one fills the whole address (line 1, line 2, town, county, postcode) in one go. Anyone who prefers typing the lot can carry on - the fields behave exactly as they do without this module installed.

## Requirements

- The `shop` module (0.1.163 or later - the release that added the `shop.checkout-address-lookup` extension point).
- A key for whichever provider you choose, entered under **Shop → Settings → Address lookup**. An environment variable acts as a fallback for each when no key is saved: `IDEAL_POSTCODES_KEY` and `GOOGLE_PLACES_API_KEY`.

## Choosing a provider

|  | Ideal Postcodes | Google |
| --- | --- | --- |
| Coverage | UK only | Worldwide, narrowed by the country codes you set |
| Source | Royal Mail PAF, so flats and unit numbers are authoritative | Google's own place data, weaker on sub-buildings |
| Cost | Typing is free; a credit is spent when a shopper picks an address | Free monthly allowance per Google SKU, then per thousand |
| Extra obligations | None | Google's terms require the "Powered by Google" credit under the suggestions, which the field renders on its own |

Both keys are stored in their own column, so switching to try the other one and switching back does not throw the first key away.

## How it works

- The module registers a client component against shop's `shop.checkout-address-lookup` extension point. Shop keeps ownership of the field's markup and styling; this module layers the suggestions dropdown, keyboard navigation and ARIA combobox wiring on top.
- Lookups are proxied through the module's own API routes, so the key never reaches the browser. Requests are rate-limited per IP and only fire after three typed characters, with a debounce.
- Providers sit behind one small interface (`lib/providers/types.ts`): autocomplete, resolve, and a check on whether an id could have come from that provider. The routes never know which one answered. Suggestion ids are opaque strings - a UDPRN for Ideal Postcodes, a place id for Google - and the provider validates its own before the id reaches a URL.
- **Google sessions**: Google bills a run of keystrokes plus the one details call that follows as a single session, keyed by a token the browser mints and tears up after each pick. The token is checked against Google's UUID shape on the way through; one that does not match is dropped rather than forwarded, so the lookup still works and is simply billed as if no session had been opened. Ideal Postcodes ignores the token.
- **Google address components** carry no notion of a PAF delivery line, so `lib/providers/google.ts` rebuilds the split: anything identifying a unit within a building becomes line 1 and the street becomes line 2, which is how PAF divides the same address. `postal_town` is the town, `administrative_area_level_2` is the county - level 1 in the UK is the nation ("England"), which is deliberately not used as a fallback.
- Google's autocomplete request sends no `includedPrimaryTypes`. That parameter only accepts Google's Table A, Table B and type-collection values, and none of the address types (`street_address`, `premise`, `subpremise`) is among them - passing one is a 400. Country codes do the narrowing instead.
- Only the shopper's own typing counts. A browser autofill (Safari's AutoFill, a password manager, a saved address) fills the whole form at once and fires the same change event a keystroke does, so before looking anything up the field checks that it is focused, that a `beforeinput` preceded the change, that the change is not flagged `insertReplacementText`, and that the value did not grow by more than a character against **the field's own last seen value** (not the `value` prop, which is a render behind). Anything left unaccounted for latches lookups off until a `keydown` lands in the field - a physical key being the one thing no autofill produces - so an unforeseen event shape costs a shopper a keypress rather than getting a free pass. `lib/edit-intent.ts` holds the decision on its own, with the cases in `lib/edit-intent.test.ts`.
- **Diagnosing it on a real device**: add `?alkdebug=1` to the checkout URL and the field grows a small panel listing the events it actually receives (`beforeinput`, each change, its inputType, focus, length change, and whether it triggered a lookup). Off without the parameter, and nothing is sent anywhere. Working out whether a keystroke came from a person is guesswork from the outside; this is how to stop guessing.
- If the key is missing, the provider is down, or the shopper is offline, the field quietly degrades to a plain input. Checkout never breaks because lookup could not help.

## Settings

**Shop → Settings → Address lookup**:

- **Suggest addresses as shoppers type** - master switch. Off means no lookups and no charges.
- **Who does the looking up** - Ideal Postcodes or Google.
- **Ideal Postcodes API key** and **Google API key** - both stored server-side; the settings screen only ever shows the last four characters of each.
- **Countries to suggest addresses in** - two-letter codes for Google, fifteen at most, `gb` by default. Ideal Postcodes is UK-only and ignores it.
