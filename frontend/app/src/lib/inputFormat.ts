/**
 * Input formatters — what a field will *accept*, not what it validates.
 *
 * Rejecting a bad character as it is typed is kinder than colouring the field
 * red after the fact: an Aadhaar number cannot contain a letter, so the box
 * simply never takes one. The Zod schema still validates the finished value —
 * these only stop the impossible from being entered in the first place.
 */

/** Digits only, truncated to `max`. */
export function digitsOnly(value: string, max: number): string {
  return value.replace(/\D/g, '').slice(0, max);
}

/** Upper-case letters and digits only, truncated to `max`. */
export function alphaNumUpper(value: string, max: number): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, max);
}

/**
 * PAN is a fixed shape — five letters, four digits, one letter — so each
 * position only accepts the kind of character that belongs there.
 *
 * The test is against the position the character would land in, not the
 * position it was typed at: filtering on the input index drops legal
 * characters whenever an illegal one appears earlier in the string.
 */
export function panMask(value: string): string {
  const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let out = '';
  for (const ch of raw) {
    if (out.length >= 10) break;
    const wantsLetter = out.length < 5 || out.length === 9;
    if (wantsLetter ? /[A-Z]/.test(ch) : /[0-9]/.test(ch)) out += ch;
  }
  return out;
}

/**
 * Driving licence: two letters (state), then digits — "KA0120239876543".
 * Fifteen characters, and only the first two may be letters. Same
 * output-position rule as `panMask`.
 */
export function licenceMask(value: string): string {
  const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let out = '';
  for (const ch of raw) {
    if (out.length >= 15) break;
    const wantsLetter = out.length < 2;
    if (wantsLetter ? /[A-Z]/.test(ch) : /[0-9]/.test(ch)) out += ch;
  }
  return out;
}
