export type Missing = {
  file?: string;
  line: number;
  col: number;
  char: string;
  codepoint: number;
};

export type CheckResult = {
  missing: Missing[];
  /** Code points visited (newlines excluded). */
  total: number;
  /** Code points ignored by the skip ranges (control / emoji / VS). */
  skipped: number;
};

/** Expand inclusive `[start, end]` ranges (as emitted by the Python sync script) into a Set. */
export function buildSupportedSet(ranges: [number, number][]): Set<number> {
  const s = new Set<number>();
  for (const [a, b] of ranges) {
    for (let cp = a; cp <= b; cp++) s.add(cp);
  }
  return s;
}

/** Scan `text` and return every code point not present in `supported`.
 *
 * Line/col are 1-based; `col` counts Unicode code points (surrogate pair = 1 column).
 * Control/format/line-separator characters and BOM/variation selectors are ignored —
 * they never render as glyphs, so flagging them would just add noise.
 */
export function checkText(text: string, supported: Set<number>, file?: string): CheckResult {
  const out: Missing[] = [];
  let line = 1;
  let col = 0;
  let total = 0;
  let skipped = 0;
  for (const ch of text) {
    if (ch === '\n') {
      line += 1;
      col = 0;
      continue;
    }
    col += 1;
    total += 1;
    const cp = ch.codePointAt(0)!;
    if (isSkippable(cp)) {
      skipped += 1;
      continue;
    }
    if (supported.has(cp)) continue;
    out.push({ file, line, col, char: ch, codepoint: cp });
  }
  return { missing: out, total, skipped };
}

function isSkippable(cp: number): boolean {
  if (cp < 0x20 || cp === 0x7f) return true;
  if (cp >= 0x80 && cp <= 0x9f) return true;
  // Visual twins of ASCII characters — translators / CSV exports often inject these
  // invisibly. Whether the font has them doesn't matter in practice since the result
  // looks identical to the ASCII counterpart.
  if (cp === 0x00a0) return true; // NO-BREAK SPACE (twin of ' ')
  if (cp === 0x2011) return true; // NON-BREAKING HYPHEN (twin of '-')
  if (cp === 0x00ad) return true; // soft hyphen
  if (cp >= 0x200b && cp <= 0x200f) return true; // zero-width + LRM/RLM
  if (cp === 0x2028 || cp === 0x2029) return true; // line / paragraph separator
  if (cp >= 0x202a && cp <= 0x202e) return true; // bidi embedding
  if (cp === 0x2060 || cp === 0x2061 || cp === 0x2062 || cp === 0x2063 || cp === 0x2064) return true;
  if (cp >= 0x2066 && cp <= 0x2069) return true; // bidi isolates
  if (cp === 0xfeff) return true; // BOM
  if (cp >= 0xfe00 && cp <= 0xfe0f) return true; // variation selectors
  if (cp >= 0xe0100 && cp <= 0xe01ef) return true; // variation selectors supplement
  // Specials block: U+FFFD = decode-failure placeholder, U+FFFC = object replacement,
  // U+FFF9–FFFB = annotations, U+FFFE/FFFF = noncharacters. None are real text content.
  if (cp >= 0xfff0 && cp <= 0xffff) return true;
  // Emoji / pictographs — not relevant for small-region-language coverage checks.
  if (cp >= 0x2600 && cp <= 0x27bf) return true; // Misc Symbols + Dingbats
  if (cp >= 0x2b00 && cp <= 0x2bff) return true; // Misc Symbols and Arrows (⭐ etc.)
  if (cp >= 0x1f000 && cp <= 0x1ffff) return true; // All SMP pictograph blocks
  return false;
}
