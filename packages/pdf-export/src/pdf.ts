// Low-level PDF writer with embedded TrueType fonts (CIDFontType2 / Identity-H).
//
// Produces a valid, compressed PDF with fully embedded subset-free TrueType
// fonts so the output has real, selectable, searchable Unicode text (via a
// /ToUnicode CMap). No external services, no canvas rasterisation.

import { zlibSync } from "fflate";
import type { ParsedFont } from "./ttf.ts";

const LATIN1 = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
};

function concat(chunks: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

function hex4(n: number): string {
  return (n & 0xffff).toString(16).padStart(4, "0").toUpperCase();
}

function utf16beHex(codepoint: number): string {
  if (codepoint > 0xffff) {
    const c = codepoint - 0x10000;
    const hi = 0xd800 + (c >> 10);
    const lo = 0xdc00 + (c & 0x3ff);
    return hex4(hi) + hex4(lo);
  }
  return hex4(codepoint);
}

export class FontHandle {
  readonly resourceName: string;
  /** Set to true if any glyph had to be replaced with a fallback. */
  hasUnsupported = false;
  private readonly used = new Map<number, number>(); // gid -> representative codepoint
  private readonly fallbackGid: number;
  private readonly fallbackCp: number;

  constructor(readonly index: number, readonly font: ParsedFont) {
    this.resourceName = `F${index}`;
    const cp = font.cmap.has(0xfffd) ? 0xfffd : font.cmap.has(0x3f) ? 0x3f : 0;
    this.fallbackCp = cp;
    this.fallbackGid = font.cmap.get(cp) ?? 0;
  }

  private gidFor(codepoint: number): { gid: number; cp: number } {
    const gid = this.font.cmap.get(codepoint);
    if (gid === undefined || gid === 0) {
      this.hasUnsupported = true;
      return { gid: this.fallbackGid, cp: this.fallbackCp };
    }
    return { gid, cp: codepoint };
  }

  /** Encode a run to a hex GID string, tracking glyphs used for embedding. */
  encodeToHex(text: string): string {
    let out = "";
    for (const ch of text) {
      const { gid, cp } = this.gidFor(ch.codePointAt(0) as number);
      if (!this.used.has(gid)) this.used.set(gid, cp);
      out += hex4(gid);
    }
    return out;
  }

  /** Width of text in points at the given font size. */
  widthOfText(text: string, sizePt: number): number {
    let units = 0;
    for (const ch of text) {
      const { gid } = this.gidFor(ch.codePointAt(0) as number);
      units += this.font.advanceWidth(gid);
    }
    return (units * sizePt) / 1000;
  }

  usedGlyphs(): Map<number, number> { return this.used; }
}

interface PendingObject { chunks: Uint8Array[]; }

export class PDFBuilder {
  private objects: (PendingObject | null)[] = [null]; // index 0 unused
  private fonts: FontHandle[] = [];
  private pages: { width: number; height: number; contentObj: number }[] = [];

  private alloc(): number {
    this.objects.push({ chunks: [] });
    return this.objects.length - 1;
  }

  private setObject(num: number, chunks: (string | Uint8Array)[]): void {
    this.objects[num] = { chunks: chunks.map((c) => (typeof c === "string" ? LATIN1(c) : c)) };
  }

  embedFont(parsed: ParsedFont): FontHandle {
    const handle = new FontHandle(this.fonts.length + 1, parsed);
    this.fonts.push(handle);
    return handle;
  }

  /** Register a page. `content` is the raw content stream text. */
  addPage(widthPt: number, heightPt: number, content: string): void {
    const compressed = zlibSync(LATIN1(content));
    const obj = this.alloc();
    this.setObject(obj, [
      `<</Length ${compressed.length}/Filter/FlateDecode>>\nstream\n`,
      compressed,
      "\nendstream",
    ]);
    this.pages.push({ width: widthPt, height: heightPt, contentObj: obj });
  }

  private buildFontObjects(): { resources: string } {
    const entries: string[] = [];
    for (const h of this.fonts) {
      const f = h.font;
      const psName = f.postScriptName;
      const used = [...h.usedGlyphs().keys()].sort((a, b) => a - b);
      if (!used.includes(0)) used.push(0);
      used.sort((a, b) => a - b);

      // W array (glyph widths in text space).
      let w = "";
      for (const gid of used) w += `${gid}[${f.advanceWidth(gid)}]`;

      // ToUnicode CMap.
      const bf: string[] = [];
      for (const [gid, cp] of h.usedGlyphs()) bf.push(`<${hex4(gid)}> <${utf16beHex(cp)}>`);
      const bfChunks: string[] = [];
      for (let i = 0; i < bf.length; i += 100) {
        const chunk = bf.slice(i, i + 100);
        bfChunks.push(`${chunk.length} beginbfchar\n${chunk.join("\n")}\nendbfchar`);
      }
      const toUni =
        "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n" +
        "/CIDSystemInfo <</Registry (Adobe) /Ordering (UCS) /Supplement 0>> def\n" +
        "/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n" +
        "1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n" +
        (bfChunks.join("\n") || "") +
        "\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend";
      const toUniComp = zlibSync(LATIN1(toUni));
      const toUniObj = this.alloc();
      this.setObject(toUniObj, [
        `<</Length ${toUniComp.length}/Filter/FlateDecode>>\nstream\n`,
        toUniComp,
        "\nendstream",
      ]);

      // FontFile2 (raw TTF, flate-compressed with /Length1 = original size).
      const fontComp = zlibSync(f.bytes);
      const fontFileObj = this.alloc();
      this.setObject(fontFileObj, [
        `<</Length ${fontComp.length}/Length1 ${f.bytes.length}/Filter/FlateDecode>>\nstream\n`,
        fontComp,
        "\nendstream",
      ]);

      // FontDescriptor.
      const flags = 32 | (f.italic ? 64 : 0); // Nonsymbolic (+Italic)
      const stemV = f.weightClass >= 600 ? 120 : 80;
      const descObj = this.alloc();
      this.setObject(descObj, [
        `<</Type/FontDescriptor/FontName/${psName}/Flags ${flags}` +
        `/FontBBox[${f.bbox.join(" ")}]/ItalicAngle ${Math.round(f.italicAngle)}` +
        `/Ascent ${f.ascent}/Descent ${f.descent}/CapHeight ${f.capHeight}/StemV ${stemV}` +
        `/FontFile2 ${fontFileObj} 0 R>>`,
      ]);

      // CIDFont (descendant).
      const cidObj = this.alloc();
      this.setObject(cidObj, [
        `<</Type/Font/Subtype/CIDFontType2/BaseFont/${psName}` +
        `/CIDSystemInfo<</Registry(Adobe)/Ordering(Identity)/Supplement 0>>` +
        `/FontDescriptor ${descObj} 0 R/CIDToGIDMap/Identity/DW 500/W [${w}]>>`,
      ]);

      // Type0 font.
      const type0Obj = this.alloc();
      this.setObject(type0Obj, [
        `<</Type/Font/Subtype/Type0/BaseFont/${psName}/Encoding/Identity-H` +
        `/DescendantFonts [${cidObj} 0 R]/ToUnicode ${toUniObj} 0 R>>`,
      ]);

      entries.push(`/${h.resourceName} ${type0Obj} 0 R`);
    }
    return { resources: entries.join(" ") };
  }

  build(): Uint8Array {
    const { resources } = this.buildFontObjects();

    const catalogObj = this.alloc();
    const pagesObj = this.alloc();
    const fontDict = `<</Font <<${resources}>>>>`;

    const pageObjs: number[] = [];
    for (const pg of this.pages) {
      const pageObj = this.alloc();
      this.setObject(pageObj, [
        `<</Type/Page/Parent ${pagesObj} 0 R/MediaBox[0 0 ${pg.width} ${pg.height}]` +
        `/Resources ${fontDict}/Contents ${pg.contentObj} 0 R>>`,
      ]);
      pageObjs.push(pageObj);
    }

    this.setObject(pagesObj, [
      `<</Type/Pages/Count ${pageObjs.length}/Kids [${pageObjs.map((n) => `${n} 0 R`).join(" ")}]>>`,
    ]);
    this.setObject(catalogObj, [`<</Type/Catalog/Pages ${pagesObj} 0 R>>`]);

    // Serialise with a cross-reference table.
    const header = "%PDF-1.7\n%\xe2\xe3\xcf\xd3\n";
    const chunks: Uint8Array[] = [LATIN1(header)];
    let offset = LATIN1(header).length;
    const xref: number[] = new Array(this.objects.length).fill(0);

    for (let i = 1; i < this.objects.length; i++) {
      const obj = this.objects[i];
      if (!obj) continue;
      xref[i] = offset;
      const head = LATIN1(`${i} 0 obj\n`);
      const tail = LATIN1("\nendobj\n");
      chunks.push(head, ...obj.chunks, tail);
      offset += head.length + tail.length;
      for (const c of obj.chunks) offset += c.length;
    }

    const xrefStart = offset;
    const count = this.objects.length;
    let xrefStr = `xref\n0 ${count}\n0000000000 65535 f \n`;
    for (let i = 1; i < count; i++) {
      xrefStr += `${String(xref[i]).padStart(10, "0")} 00000 n \n`;
    }
    xrefStr +=
      `trailer\n<</Size ${count}/Root ${catalogObj} 0 R>>\n` +
      `startxref\n${xrefStart}\n%%EOF\n`;
    chunks.push(LATIN1(xrefStr));

    return concat(chunks);
  }
}
