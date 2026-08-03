# Address Lookup for Shop

Checkout address lookup for the Cactus shop module, powered by [Ideal Postcodes](https://ideal-postcodes.co.uk).

Shoppers type the first line of their address into the ordinary Address line 1 field; suggestions appear as they type, and picking one fills the whole address (line 1, line 2, town, county, postcode) in one go. Anyone who prefers typing the lot can carry on - the fields behave exactly as they do without this module installed.

## Requirements

- The `shop` module (0.1.163 or later - the release that added the `shop.checkout-address-lookup` extension point).
- An Ideal Postcodes API key, entered under **Shop → Settings → Address lookup** (or supplied as the `IDEAL_POSTCODES_KEY` environment variable, which acts as a fallback when no key is saved).

## How it works

- The module registers a client component against shop's `shop.checkout-address-lookup` extension point. Shop keeps ownership of the field's markup and styling; this module layers the suggestions dropdown, keyboard navigation and ARIA combobox wiring on top.
- Lookups are proxied through the module's own API routes, so the key never reaches the browser. Requests are rate-limited per IP and only fire after three typed characters, with a debounce - Ideal Postcodes bills per lookup.
- Only the shopper's own typing counts. A browser autofill (Safari's AutoFill, a password manager, a saved address) fills the whole form at once and fires the same change event a keystroke does, so before looking anything up the field checks that it is focused, that a `beforeinput` preceded the change, that the change is not flagged `insertReplacementText`, and that the value did not grow by more than a character against **the field's own last seen value** (not the `value` prop, which is a render behind). Anything left unaccounted for latches lookups off until a `keydown` lands in the field - a physical key being the one thing no autofill produces - so an unforeseen event shape costs a shopper a keypress rather than getting a free pass. `lib/edit-intent.ts` holds the decision on its own, with the cases in `lib/edit-intent.test.ts`.
- **Diagnosing it on a real device**: add `?alkdebug=1` to the checkout URL and the field grows a small panel listing the events it actually receives (`beforeinput`, each change, its inputType, focus, length change, and whether it triggered a lookup). Off without the parameter, and nothing is sent anywhere. Working out whether a keystroke came from a person is guesswork from the outside; this is how to stop guessing.
- If the key is missing, the provider is down, or the shopper is offline, the field quietly degrades to a plain input. Checkout never breaks because lookup could not help.

## Settings

**Shop → Settings → Address lookup**:

- **Suggest addresses as shoppers type** - master switch. Off means no lookups and no per-lookup charges.
- **Ideal Postcodes API key** - stored server-side; the settings screen only ever shows the last four characters.
