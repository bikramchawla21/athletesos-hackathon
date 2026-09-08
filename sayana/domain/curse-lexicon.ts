export type CurseEntry = {
  /** Canonical counter key. */
  id: string;
  aliases: string[];
};

function entry(id: string, aliases: string[]): CurseEntry {
  const extra = aliases.includes(id) ? aliases : [id, ...aliases];
  return { id, aliases: extra };
}

/** Closed lexicon. Longest alias wins so motherfucker ≠ fuck, madarchod ≠ chod. */
export const CURSE_LEXICON: CurseEntry[] = [
  entry("motherfucker", ["motherfuckers", "motherfucking", "mofo"]),
  entry("fuck", ["fucks", "fucked", "fuckin", "fucking", "fucker", "fuckers", "fck", "f*ck"]),
  entry("bitch", ["bitches", "bitchy"]),
  entry("shit", ["shits", "shitty", "bullshit", "bs"]),
  entry("asshole", ["assholes"]),
  entry("bastard", ["bastards"]),
  entry("cunt", ["cunts"]),
  entry("dick", ["dicks"]),
  entry("piss", ["pissing", "pissed"]),
  entry("damn", ["goddamn", "goddammit", "dammit"]),
  entry("crap", ["crappy"]),
  entry("wtf", ["wtf"]),
  entry("madarchod", [
    "madarchod",
    "madhchod",
    "maderchod",
    "madarchodh",
    "madarchod",
    "मादरचोद",
    "मादरचोद",
  ]),
  entry("bhenchod", [
    "bhenchod",
    "behenchod",
    "bhainchod",
    "behenchod",
    "बहनचोद",
    "भेंचोद",
    "भैनचोद",
  ]),
  entry("betichod", ["betichod", "बेटीचोद"]),
  entry("bhosdike", [
    "bhosdike",
    "bhosdi",
    "bhosadi",
    "bhosada",
    "bhosdike",
    "भोसड़ीके",
    "भोसड़ी",
  ]),
  entry("maaki", ["maa ki chut", "teri maa ki", "maa ki", "माँ की"]),
  entry("bakchod", ["bakchod", "bakchodi", "बकचोद"]),
  entry("chutiya", ["chutiya", "chutiye", "chootiya", "चूतिया", "चूतिये"]),
  entry("chut", ["choot", "chuut", "चूत"]),
  entry("gaandu", ["gaandu", "gandu", "गांडू"]),
  entry("gaand", ["gaand", "gand", "गांड"]),
  entry("lund", ["lund", "लंड", "लण्ड"]),
  entry("lawda", ["lawda", "lauda", "loda", "lavda", "लौड़ा", "लौडा"]),
  entry("jhaantu", ["jhaantu", "झांटू"]),
  entry("jhaant", ["jhaant", "jhaat", "झांट"]),
  entry("bur", ["bur", "बुर"]),
  entry("harami", ["harami", "haraami", "हरामी"]),
  entry("haramzada", ["haramzada", "haramzadi", "हरामजादा"]),
  entry("kameena", ["kameena", "kameeni", "kamina", "कमीना", "कमीनी"]),
  entry("bhadwa", ["bhadwa", "bhadwe", "bhadva", "भड़वा", "भड़वे"]),
  entry("randi", ["randi", "randwa", "raand", "रंडी"]),
  entry("chinal", ["chinal", "चिनाल"]),
  entry("saala", ["saala", "साला"]),
  entry("saali", ["saali", "साली"]),
  entry("kutta", ["kutta", "kutte", "kutti", "kutiya", "कुत्ता", "कुत्ते"]),
  entry("suar", ["suar", "soor", "सूअर"]),
  entry("tharki", ["tharki", "tharak", "थरकी"]),
  entry("chodu", ["chodu", "chode", "चोदू"]),
  entry("tatti", ["tatti", "टट्टी"]),
  entry("ullu_ka_pattha", ["ullu ka pattha", "ulloo ka pattha"]),
  entry("ullu", ["ullu", "ulloo", "उल्लू"]),
  entry("phuddi", ["phuddi", "fuddi", "ਫੁੱਦੀ"]),
  entry("lulli", ["lulli", "ਲੁੱਲੀ"]),
  entry("kanjar", ["kanjar", "kanjari", "ਕੰਜਰ"]),
  entry("luccha", ["luccha", "luchha", "ਲੁੱਚਾ"]),
  entry("maa_di", ["maa di", "ਮਾਂ ਦੀ"]),
  entry("bhen_di", ["bhen di", "bhain di", "ਭੈਣ ਦੀ"]),
  entry("hagga", ["hagga"]),
  entry("muttar", ["muttar", "ਮੂਤ"]),
  entry("khota", ["khota", "ਖੋਤਾ"]),
  entry("rakhail", ["rakhail"]),
  entry("pendu", ["pendu"]),
  entry("haramkhor", ["haramkhor", "haram khor"]),
  entry("walad_haram", ["walad haram", "haram ka"]),
  entry("beghairat", ["beghairat"]),
  entry("sharmuta", ["sharmuta"]),
  entry("khusra", ["khusra"]),
  entry("lanat", ["lanat"]),
  entry("najayaz", ["najayaz"]),
  entry("gandah", ["gandah"]),
  entry("aai_zhavadya", ["aai zhavadya", "aai ghalya"]),
  entry("zhavadya", ["zhavadya"]),
  entry("bokya", ["bokya"]),
  entry("magi", ["magi"]),
  entry("khankir_chele", ["khankir chele"]),
  entry("shuorer_baccha", ["shuorer baccha", "shuorer baccha"]),
  entry("kuttar_baccha", ["kuttar baccha"]),
  entry("ommala", ["ommala"]),
  entry("pundai", ["pundai"]),
  entry("thevidiya", ["thevidiya"]),
  entry("koodhi", ["koodhi"]),
  entry("myiru", ["myiru"]),
  entry("lanja", ["lanja"]),
  entry("puku", ["puku"]),
  entry("dengey", ["dengey"]),
];

const STANDALONE_ABBREV: Record<string, string> = {
  mc: "madarchod",
  bc: "bhenchod",
};

export type PreparedLexicon = {
  phrases: { alias: string; id: string; tokenCount: number }[];
  singles: Map<string, string>;
};

export function prepareLexicon(entries: CurseEntry[] = CURSE_LEXICON): PreparedLexicon {
  const phrases: PreparedLexicon["phrases"] = [];
  const singles = new Map<string, string>();
  for (const e of entries) {
    for (const alias of e.aliases) {
      const a = alias.normalize("NFKC").toLowerCase().trim();
      if (!a) continue;
      const parts = a.split(/\s+/);
      if (parts.length > 1) {
        phrases.push({ alias: a, id: e.id, tokenCount: parts.length });
      } else {
        const existing = singles.get(a);
        if (!existing || e.id.length >= existing.length) {
          singles.set(a, e.id);
        }
      }
    }
  }
  phrases.sort((x, y) => y.alias.length - x.alias.length);
  return { phrases, singles };
}

const PREPARED = prepareLexicon();

export function getPreparedLexicon(): PreparedLexicon {
  return PREPARED;
}

export { STANDALONE_ABBREV };
