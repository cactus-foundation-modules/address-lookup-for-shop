// Deciding whether a change to the Address line 1 field came from the shopper
// typing or from the browser filling the form in for them.
//
// Safari's AutoFill, a password manager and the browser's own saved address all
// set the field's value and dispatch exactly the same input event a keystroke
// does, so the field has no business trusting the event alone: it would look up
// an address nobody typed, bill for it, and drop a suggestions list over a form
// that was already correctly filled in.
//
// Three things separate a shopper's edit from a fill:
//
//   1. Focus. A fill triggered from any of the other boxes lands on line 1
//      while line 1 is not the focused element.
//   2. A preceding beforeinput event. That fires for genuine editing - typing,
//      pasting, deleting, composing, dictating - and not for a value the
//      browser sets on the shopper's behalf. It is the reliable half of this;
//      the rest is belt and braces.
//   3. The shape of the change. Typing arrives one character at a time, while a
//      fill arrives whole. Growing the field by more than a character without
//      announcing itself as a paste is the browser helping.
//
// Chrome labels its own autofill 'insertReplacementText', which is rejected
// outright. Deliberately no "recent keypress" fallback: a shopper who types a
// couple of characters and then taps Safari's AutoFill suggestion does so
// within a second of their last keystroke, which is precisely the case this is
// here to catch.

export const EDIT_INTENT_WINDOW_MS = 300

export type AlkEditIntent = {
  // When the beforeinput event fired (epoch ms), or 0 if none has.
  at: number
  inputType: string
}

export type AlkChangeContext = {
  // Whether the line 1 input is the document's focused element.
  focused: boolean
  // The beforeinput stamp seen since the last change, already consumed.
  intent: AlkEditIntent
  // inputType carried by the change itself, where the browser provides one.
  inputType: string
  previousValue: string
  nextValue: string
  now: number
}

const PASTE_TYPES = new Set(['insertFromPaste', 'insertFromDrop', 'insertFromYank'])

export function isShopperEdit({ focused, intent, inputType, previousValue, nextValue, now }: AlkChangeContext): boolean {
  if (!focused) return false
  if (!intent.at || now - intent.at > EDIT_INTENT_WINDOW_MS) return false
  const type = intent.inputType || inputType
  if (type === 'insertReplacementText') return false
  if (!PASTE_TYPES.has(type) && nextValue.length - previousValue.length > 1) return false
  return true
}
