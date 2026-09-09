/** Arabic / Urdu / Persian letters. Hindi is Devanagari, not this. */
export const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

export function hasArabicScript(text: string): boolean {
  return ARABIC_SCRIPT.test(text);
}
