// Minimal, dependency-free TrueType (.ttf) parser.
//
// Extracts only what a PDF CIDFontType2 / Identity-H embedding needs:
//   - a Unicode codepoint -> glyph id (GID) map (cmap format 4 and 12)
//   - per-glyph advance widths (hmtx) scaled to the PDF 1000-unit text space
//   - the font metrics used by /FontDescriptor (bbox, ascent, descent, ...).
//
// The parser is intentionally tolerant: unknown/missing optional tables fall
// back to reasonable defaults rather than throwing, because the vendored
// Liberation Sans fonts are trusted input generated at build time.

export interface ParsedFont {
  /** Raw, untouched font bytes — embedded verbatim as /FontFile2. */
  readonly bytes: Uint8Array;
  /** PostScript name used for /BaseFont and /FontName. */
  readonly postScriptName: string;
  readonly unitsPerEm: number;
  readonly numGlyphs: number;
  /** Codepoint -> glyph id. */
  readonly cmap: Map<number, number>;
  /** Glyph id -> advance width in 1000-unit text space. */
  readonly advanceWidth: (gid: number) => number;
  /** True when the font declares italic. */
  readonly italic: boolean;
  readonly italicAngle: number;
  readonly weightClass: number;
  /** All metrics below are in 1000-unit text space. */
  readonly bbox: readonly [number, number, number, number];
  readonly ascent: number;
  readonly descent: number;
  readonly capHeight: number;
}

class Reader {
  private readonly view: DataView;
  constructor(private readonly buf: Uint8Array) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  u8(o: number): number { return this.view.getUint8(o); }
  u16(o: number): number { return this.view.getUint16(o); }
  i16(o: number): number { return this.view.getInt16(o); }
  u32(o: number): number { return this.view.getUint32(o); }
  i32(o: number): number { return this.view.getInt32(o); }
  tag(o: number): string {
    let s = "";
    for (let i = 0; i < 4; i++) s += String.fromCharCode(this.buf[o + i]);
    return s;
  }
}

interface TableRec { offset: number; length: number; }

function readTableDirectory(r: Reader): Map<string, TableRec> {
  const tables = new Map<string, TableRec>();
  const numTables = r.u16(4);
  let p = 12;
  for (let i = 0; i < numTables; i++) {
    const tag = r.tag(p);
    const offset = r.u32(p + 8);
    const length = r.u32(p + 12);
    tables.set(tag, { offset, length });
    p += 16;
  }
  return tables;
}

// --- cmap ------------------------------------------------------------------

function parseCmapFormat4(r: Reader, base: number, out: Map<number, number>): void {
  const segX2 = r.u16(base + 6);
  const segCount = segX2 / 2;
  const endO = base + 14;
  const startO = endO + segX2 + 2; // +2 skips reservedPad
  const deltaO = startO + segX2;
  const rangeO = deltaO + segX2;
  for (let s = 0; s < segCount; s++) {
    const end = r.u16(endO + s * 2);
    const start = r.u16(startO + s * 2);
    const delta = r.u16(deltaO + s * 2);
    const rangeOffset = r.u16(rangeO + s * 2);
    if (start === 0xffff) continue;
    for (let c = start; c <= end; c++) {
      let gid: number;
      if (rangeOffset === 0) {
        gid = (c + delta) & 0xffff;
      } else {
        const gO = rangeO + s * 2 + rangeOffset + (c - start) * 2;
        gid = r.u16(gO);
        if (gid !== 0) gid = (gid + delta) & 0xffff;
      }
      if (gid !== 0 && !out.has(c)) out.set(c, gid);
    }
  }
}

function parseCmapFormat12(r: Reader, base: number, out: Map<number, number>): void {
  const nGroups = r.u32(base + 12);
  let g = base + 16;
  for (let i = 0; i < nGroups; i++) {
    const startChar = r.u32(g);
    const endChar = r.u32(g + 4);
    const startGid = r.u32(g + 8);
    for (let c = startChar; c <= endChar; c++) {
      const gid = startGid + (c - startChar);
      if (gid !== 0 && !out.has(c)) out.set(c, gid);
    }
    g += 12;
  }
}

function parseCmap(r: Reader, rec: TableRec): Map<number, number> {
  const out = new Map<number, number>();
  const base = rec.offset;
  const numSub = r.u16(base + 2);
  // Prefer a full-repertoire Unicode subtable (3/10 or 0/6), then BMP (3/1, 0/3).
  let best: { off: number; score: number } | null = null;
  for (let i = 0; i < numSub; i++) {
    const p = base + 4 + i * 8;
    const platform = r.u16(p);
    const encoding = r.u16(p + 2);
    const off = base + r.u32(p + 4);
    let score = 0;
    if (platform === 3 && encoding === 10) score = 5;
    else if (platform === 0 && (encoding === 4 || encoding === 6)) score = 4;
    else if (platform === 3 && encoding === 1) score = 3;
    else if (platform === 0) score = 2;
    else if (platform === 3 && encoding === 0) score = 1;
    if (score > 0 && (!best || score > best.score)) best = { off, score };
  }
  if (!best) return out;
  const format = r.u16(best.off);
  if (format === 4) parseCmapFormat4(r, best.off, out);
  else if (format === 12) parseCmapFormat12(r, best.off, out);
  else {
    // Fall back to the highest-scoring format we do understand.
    for (let i = 0; i < numSub; i++) {
      const p = base + 4 + i * 8;
      const off = base + r.u32(p + 4);
      const f = r.u16(off);
      if (f === 4) { parseCmapFormat4(r, off, out); break; }
      if (f === 12) { parseCmapFormat12(r, off, out); break; }
    }
  }
  return out;
}

// --- name (PostScript name, id 6) ------------------------------------------

function parseName(r: Reader, rec: TableRec | undefined, fallback: string): string {
  if (!rec) return fallback;
  const base = rec.offset;
  const count = r.u16(base + 2);
  const strOffset = base + r.u16(base + 4);
  let best = "";
  for (let i = 0; i < count; i++) {
    const p = base + 6 + i * 12;
    const platform = r.u16(p);
    const nameId = r.u16(p + 6);
    if (nameId !== 6) continue;
    const len = r.u16(p + 8);
    const off = strOffset + r.u16(p + 10);
    let s = "";
    if (platform === 3 || platform === 0) {
      for (let k = 0; k < len; k += 2) s += String.fromCharCode(r.u16(off + k));
    } else {
      for (let k = 0; k < len; k++) s += String.fromCharCode(r.u8(off + k));
    }
    if (s) { best = s; if (platform === 3) break; }
  }
  // A PostScript name must be printable ASCII without spaces.
  best = best.replace(/[^\x21-\x7e]/g, "");
  return best || fallback;
}

export function parseFont(bytes: Uint8Array, fallbackName: string, italic: boolean): ParsedFont {
  const r = new Reader(bytes);
  const tables = readTableDirectory(r);
  const head = tables.get("head");
  const hhea = tables.get("hhea");
  const maxp = tables.get("maxp");
  const hmtx = tables.get("hmtx");
  const cmapRec = tables.get("cmap");
  const os2 = tables.get("OS/2");
  const post = tables.get("post");
  if (!head || !hhea || !maxp || !hmtx || !cmapRec) {
    throw new Error("pdf-export: font is missing a required table");
  }

  const unitsPerEm = r.u16(head.offset + 18) || 1000;
  const scale = 1000 / unitsPerEm;
  const numGlyphs = r.u16(maxp.offset + 4);
  const numberOfHMetrics = r.u16(hhea.offset + 34);

  // hmtx: numberOfHMetrics pairs, remaining glyphs reuse the last advance.
  const widths = new Int32Array(numGlyphs);
  let lastAdvance = 0;
  for (let i = 0; i < numGlyphs; i++) {
    if (i < numberOfHMetrics) lastAdvance = r.u16(hmtx.offset + i * 4);
    widths[i] = Math.round(lastAdvance * scale);
  }

  const cmap = parseCmap(r, cmapRec);

  const xMin = Math.round(r.i16(head.offset + 36) * scale);
  const yMin = Math.round(r.i16(head.offset + 38) * scale);
  const xMax = Math.round(r.i16(head.offset + 40) * scale);
  const yMax = Math.round(r.i16(head.offset + 42) * scale);

  let ascent = Math.round(r.i16(hhea.offset + 4) * scale);
  let descent = Math.round(r.i16(hhea.offset + 6) * scale);
  let capHeight = Math.round(0.7 * 1000);
  let weightClass = 400;
  if (os2) {
    const sTypoAscender = r.i16(os2.offset + 68);
    const sTypoDescender = r.i16(os2.offset + 70);
    if (sTypoAscender) ascent = Math.round(sTypoAscender * scale);
    if (sTypoDescender) descent = Math.round(sTypoDescender * scale);
    weightClass = r.u16(os2.offset + 4) || 400;
    const version = r.u16(os2.offset);
    if (version >= 2 && os2.length >= 90) {
      const sCapHeight = r.i16(os2.offset + 88);
      if (sCapHeight) capHeight = Math.round(sCapHeight * scale);
    }
  }

  let italicAngle = 0;
  if (post) {
    // italicAngle is a 16.16 fixed-point value.
    italicAngle = r.i32(post.offset + 4) / 65536;
  }

  const postScriptName = parseName(r, tables.get("name"), fallbackName);

  return {
    bytes,
    postScriptName,
    unitsPerEm,
    numGlyphs,
    cmap,
    advanceWidth: (gid: number) => (gid >= 0 && gid < numGlyphs ? widths[gid] : 0),
    italic,
    italicAngle: italic && italicAngle === 0 ? -12 : italicAngle,
    weightClass,
    bbox: [xMin, yMin, xMax, yMax],
    ascent,
    descent,
    capHeight,
  };
}
