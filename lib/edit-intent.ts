// Deciding whether a change to the Address line 1 field came from the shopper
// typing or from the browser filling the form in for them.
//
// Safari's AutoFill, a password manager and the browser's own saved address all
// set the field's value and dispatch exactly the same input event a keystroke
// does. There is no flag in the web platform saying which is which, so this is
// inference - and two earlier attempts at it inferred wrongly on real Safari.
// What is left is arranged so that a wrong inference is self-correcting rather
// than permanent:
//
//   1. Focus. A fill triggered from one of the other boxes lands on line 1
//      while line 1 is not the focused element.
//   2. A preceding beforeinput event, which fires for editing and not for a
//      value the browser sets on the shopper's behalf.
//   3. The shape of the change, measured against the field's own last known
//      value rather than the value prop. The prop is a render behind, and a
//      browser that fires two input events for one fill would find the second
//      one comparing the filled value against itself and calling it a no-op
//      edit. Typing grows a field a character at a time; a fill arrives whole.
//   4. The latch. Anything the first three cannot account for latches lookups
//      off, and only a keydown - a physical key, which no autofill produces -
//      unlatches them. So an event shape nobody predicted costs the shopper
//      nothing more than having to press a key before suggestions resume,
//      which is what "only when they are typing in the field" meant anyway.

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
  // The field's value as this component last saw it, not the value prop.
  previousValue: string
  nextValue: string
  // Set by any earlier change that could not be attributed to the shopper, and
  // cleared only by a keydown in the field.
  filled: boolean
  now: number
}

const PASTE_TYPES = new Set(['insertFromPaste', 'insertFromDrop', 'insertFromYank'])

export function isShopperEdit({ focused, intent, inputType, previousValue, nextValue, filled, now }: AlkChangeContext): boolean {
  if (filled) return false
  if (!focused) return false
  if (!intent.at || now - intent.at > EDIT_INTENT_WINDOW_MS) return false
  const type = intent.inputType || inputType
  if (type === 'insertReplacementText') return false
  if (!PASTE_TYPES.has(type) && nextValue.length - previousValue.length > 1) return false
  return true
}
