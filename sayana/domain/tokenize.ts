const LATIN_STOP = new Set(
  `a an the and or but if then so to of in on at for from with as is was were be been being i me my we our you your he she it they them this that these those not no yes just like really very too also about into over after before have has had do did doing get got going gonna gonna gonna uh um yeah ok okay`.split(
    " ",
  ),
);

const HI_STOP = new Set(
  `hai haiin ho hoon hun main mein mai kya ki ka ke ko se aur ya to bhi na nahi nahiin tha thi the ek yeh woh wo bas ab phir kuch kuchh jo kiya kiye raha rahe rahi`.split(
    " ",
  ),
);

/** Split Latin, Devanagari, Gurmukhi, Arabic-script tokens. */
export function tokenize(text: string): string[] {
  const raw = text.normalize("NFKC").toLowerCase();
  const matches = raw.match(/[a-z']+|[\u0900-\u097F]+|[\u0A00-\u0A7F]+|[\u0600-\u06FF]+/g);
  return matches ?? [];
}

export function isStopword(token: string): boolean {
  return LATIN_STOP.has(token) || HI_STOP.has(token) || token.length < 2;
}

export function contentWordHistogram(tokens: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of tokens) {
    if (isStopword(t)) continue;
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}

export function topWords(histogram: Record<string, number>, n = 12): { word: string; count: number }[] {
  return Object.entries(histogram)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([word, count]) => ({ word, count }));
}
