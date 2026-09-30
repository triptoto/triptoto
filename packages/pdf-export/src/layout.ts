// Flow + pagination engine for the trip PDF.
//
// Turns a high-level, trip-agnostic block DSL into paginated PDF pages with a
// running header, page numbers and a discreet footer. Layout is line-based:
// every block is expanded into atomic horizontal "lines"; cards carry their
// own background/accent strip per line, so a card that crosses a page boundary
// stays visually continuous without any cross-page background bookkeeping.

import { PDFBuilder, FontHandle } from "./pdf.ts";
import { parseFont } from "./ttf.ts";

export type RGB = readonly [number, number, number];

export interface FontBytes {
  regular: Uint8Array;
  bold: Uint8Array;
  italic: Uint8Array;
}

export type LayoutBlock =
  | { type: "cover"; eyebrow?: string; title: string; subtitle?: string; meta?: string }
  | { type: "title"; text: string }
  | { type: "subtitle"; text: string }
  | { type: "meta"; text: string }
  | { type: "space"; h: number }
  | { type: "rule" }
  | { type: "daysep"; text: string; sub?: string }
  | { type: "sectionhead"; text: string }
  | {
      type: "card";
      accent: RGB;
      title: string;
      titleRight?: string;
      badge?: string;
      subtitle?: string;
      rows: { label?: string; value: string }[];
      notes?: string[];
    }
  | { type: "checkitem"; text: string; done: boolean; who?: string }
  | { type: "note"; text: string };

export interface RenderSpec {
  fonts: FontBytes;
  page?: { width: number; height: number; margin: number };
  headerLeft: string;
  headerRight?: string;
  footer: string;
  blocks: LayoutBlock[];
}

export interface RenderResult {
  bytes: Uint8Array;
  pageCount: number;
  hasUnsupported: boolean;
}

// --- Colours (light, print-safe adaptation of the app tokens) --------------
const INK: RGB = [0.13, 0.17, 0.22];
const MUTED: RGB = [0.42, 0.45, 0.5];
const FAINT: RGB = [0.55, 0.58, 0.62];
const HAIR: RGB = [0.88, 0.89, 0.91];
const CARD_BG: RGB = [0.965, 0.972, 0.98];
const WHITE: RGB = [1, 1, 1];
const COVER: RGB = [0.055, 0.12, 0.18];
const COVER_SOFT: RGB = [0.105, 0.22, 0.29];
const BRAND: RGB = [0.84, 0.58, 0.12];

const A4 = { width: 595.28, height: 841.89, margin: 42 };
const CARD_PAD = 10; // horizontal inset of card text from the strip edge
const LEADING = 1.32;

interface DrawLine {
  height: number;
  card?: { bg: RGB; accent: RGB };
  draw: (c: Canvas, xLeft: number, yTop: number, width: number) => void;
}

// A block is a group of lines with a "keep the first N together" rule.
interface Block {
  lines: DrawLine[];
  keepHead: number;
}

function pdfNum(n: number): string {
  // Compact fixed formatting; avoids exponent notation in the content stream.
  return (Math.round(n * 1000) / 1000).toString();
}

class Canvas {
  private ops: string[] = [];
  constructor(private readonly pageHeight: number) {}

  fillRect(x: number, yTop: number, w: number, h: number, rgb: RGB): void {
    const y = this.pageHeight - yTop - h;
    this.ops.push(
      `${pdfNum(rgb[0])} ${pdfNum(rgb[1])} ${pdfNum(rgb[2])} rg`,
      `${pdfNum(x)} ${pdfNum(y)} ${pdfNum(w)} ${pdfNum(h)} re f`,
    );
  }

  line(x1: number, yTop: number, x2: number, rgb: RGB, w = 0.6): void {
    const y = this.pageHeight - yTop;
    this.ops.push(
      `${pdfNum(rgb[0])} ${pdfNum(rgb[1])} ${pdfNum(rgb[2])} RG ${pdfNum(w)} w`,
      `${pdfNum(x1)} ${pdfNum(y)} m ${pdfNum(x2)} ${pdfNum(y)} l S`,
    );
  }

  // Draw text with baseline positioned `ascent` below yTop.
  text(x: number, yTop: number, str: string, font: FontHandle, size: number, rgb: RGB): void {
    if (!str) return;
    const baseline = this.pageHeight - (yTop + size);
    const hex = font.encodeToHex(str);
    this.ops.push(
      "BT",
      `/${font.resourceName} ${pdfNum(size)} Tf`,
      `${pdfNum(rgb[0])} ${pdfNum(rgb[1])} ${pdfNum(rgb[2])} rg`,
      `1 0 0 1 ${pdfNum(x)} ${pdfNum(baseline)} Tm`,
      `<${hex}> Tj`,
      "ET",
    );
  }

  toString(): string {
    return this.ops.join("\n");
  }
}

function wrapText(text: string, font: FontHandle, size: number, maxWidth: number): string[] {
  const paragraphs = String(text).split(/\r?\n/);
  const out: string[] = [];
  for (const para of paragraphs) {
    if (!para.trim()) { out.push(""); continue; }
    const words = para.split(/\s+/).filter(Boolean);
    let cur = "";
    for (const word of words) {
      const attempt = cur ? cur + " " + word : word;
      if (font.widthOfText(attempt, size) <= maxWidth || !cur) {
        if (font.widthOfText(word, size) > maxWidth && !cur) {
          // Hard-break an over-long token (e.g. a URL) by character.
          let chunk = "";
          for (const ch of word) {
            if (font.widthOfText(chunk + ch, size) > maxWidth && chunk) {
              out.push(chunk);
              chunk = ch;
            } else chunk += ch;
          }
          cur = chunk;
        } else cur = attempt;
      } else {
        out.push(cur);
        cur = word;
      }
    }
    if (cur) out.push(cur);
  }
  return out.length ? out : [""];
}

function mixColor(base: RGB, accent: RGB, amount: number): RGB {
  return [
    base[0] + (accent[0] - base[0]) * amount,
    base[1] + (accent[1] - base[1]) * amount,
    base[2] + (accent[2] - base[2]) * amount,
  ];
}

export function render(spec: RenderSpec): RenderResult {
  const page = spec.page || A4;
  const margin = page.margin;
  const contentWidth = page.width - margin * 2;
  const footerReserve = 26;
  const topLimit = margin + 14; // leave room under the running header
  const bottomLimit = page.height - margin - footerReserve;

  const builder = new PDFBuilder();
  const regular = builder.embedFont(parseFont(spec.fonts.regular, "LiberationSans", false));
  const bold = builder.embedFont(parseFont(spec.fonts.bold, "LiberationSans-Bold", false));
  const italic = builder.embedFont(parseFont(spec.fonts.italic, "LiberationSans-Italic", true));

  // --- Expand blocks into pagination blocks -------------------------------
  const blocks: Block[] = [];
  const simple = (line: DrawLine): Block => ({ lines: [line], keepHead: 1 });

  const textLines = (
    text: string,
    font: FontHandle,
    size: number,
    color: RGB,
    opts: { indent?: number; gapAfter?: number; card?: { bg: RGB; accent: RGB } } = {},
  ): DrawLine[] => {
    const indent = opts.indent || 0;
    const avail = contentWidth - indent - (opts.card ? CARD_PAD * 2 : 0);
    const wrapped = wrapText(text, font, size, avail);
    const lineH = size * LEADING;
    return wrapped.map((str, i) => ({
      height: lineH + (i === wrapped.length - 1 ? opts.gapAfter || 0 : 0),
      card: opts.card,
      draw: (c, xLeft, yTop) => {
        const tx = xLeft + indent + (opts.card ? CARD_PAD : 0);
        c.text(tx, yTop + (lineH - size) / 2, str, font, size, color);
      },
    }));
  };

  for (const b of spec.blocks) {
    if (b.type === "cover") {
      const titleLines = wrapText(b.title, bold, 27, contentWidth - 54);
      const subtitleLines = b.subtitle ? wrapText(b.subtitle, regular, 12, contentWidth - 54) : [];
      const metaLines = b.meta ? wrapText(b.meta, regular, 8.5, contentWidth - 54) : [];
      const titleH = titleLines.length * 34;
      const subtitleH = subtitleLines.length * 16;
      const metaH = metaLines.length * 12;
      const height = Math.max(178, 64 + titleH + subtitleH + metaH);
      blocks.push(simple({
        height,
        draw: (c, xLeft, yTop, width) => {
          c.fillRect(xLeft, yTop, width, height, COVER);
          c.fillRect(xLeft, yTop, 7, height, BRAND);
          // A restrained geometric brand motif: decorative, ink-friendly and
          // intentionally free of raster images so it prints crisply.
          c.fillRect(xLeft + width - 64, yTop + 20, 28, 28, COVER_SOFT);
          c.fillRect(xLeft + width - 31, yTop + 20, 11, 11, BRAND);
          c.fillRect(xLeft + width - 31, yTop + 36, 11, 11, mixColor(COVER_SOFT, WHITE, 0.18));
          let yCursor = yTop + 24;
          const eyebrow = b.eyebrow || "TRIPTO · TRAVEL ITINERARY";
          c.text(xLeft + 24, yCursor, eyebrow.toUpperCase(), bold, 8.5, BRAND);
          yCursor += 24;
          for (const line of titleLines) {
            c.text(xLeft + 24, yCursor, line, bold, 27, WHITE);
            yCursor += 34;
          }
          yCursor += 4;
          for (const line of subtitleLines) {
            c.text(xLeft + 24, yCursor, line, regular, 12, mixColor(WHITE, COVER, 0.23));
            yCursor += 16;
          }
          if (metaLines.length) {
            yCursor += 8;
            for (const line of metaLines) {
              c.text(xLeft + 24, yCursor, line, regular, 8.5, mixColor(WHITE, COVER, 0.38));
              yCursor += 12;
            }
          }
        },
      }));
      continue;
    }
    if (b.type === "space") { blocks.push(simple({ height: b.h, draw: () => {} })); continue; }
    if (b.type === "rule") {
      blocks.push(simple({
        height: 10,
        draw: (c, xLeft, yTop, width) => c.line(xLeft, yTop + 5, xLeft + width, HAIR),
      }));
      continue;
    }
    if (b.type === "title") { for (const l of textLines(b.text, bold, 20, INK, { gapAfter: 2 })) blocks.push(simple(l)); continue; }
    if (b.type === "subtitle") { for (const l of textLines(b.text, regular, 12, MUTED, { gapAfter: 1 })) blocks.push(simple(l)); continue; }
    if (b.type === "meta") { for (const l of textLines(b.text, regular, 9, FAINT)) blocks.push(simple(l)); continue; }
    if (b.type === "note") { for (const l of textLines(b.text, italic, 9, MUTED, { gapAfter: 3 })) blocks.push(simple(l)); continue; }
    if (b.type === "sectionhead") {
      const lines: DrawLine[] = [{
        height: 20,
        draw: (c, xLeft, yTop) => {
          c.fillRect(xLeft, yTop + 4, 3, 12, BRAND);
          c.text(xLeft + 10, yTop + 2, b.text.toUpperCase(), bold, 10.5, INK);
        },
      }];
      blocks.push({ lines, keepHead: lines.length });
      continue;
    }
    if (b.type === "daysep") {
      const lines: DrawLine[] = [{ height: 12, draw: () => {} }];
      lines.push({
        height: 22,
        draw: (c, xLeft, yTop) => {
          c.fillRect(xLeft, yTop + 3, 4, 16, BRAND);
          c.text(xLeft + 12, yTop + 2, b.text, bold, 13, INK);
        },
      });
      if (b.sub) lines.push(...textLines(b.sub, regular, 9, MUTED, { indent: 12 }));
      lines.push({
        height: 8,
        draw: (c, xLeft, yTop, width) => c.line(xLeft, yTop + 3, xLeft + width, HAIR, 0.8),
      });
      blocks.push({ lines, keepHead: lines.length });
      continue;
    }
    if (b.type === "checkitem") {
      const box = b.done ? "[x]" : "[ ]";
      const who = b.who ? `  — ${b.who}` : "";
      const lines = textLines(`${box} ${b.text}${who}`, regular, 10, b.done ? MUTED : INK, { indent: 4, gapAfter: 2 });
      blocks.push({ lines, keepHead: 1 });
      continue;
    }
    if (b.type === "card") {
      const card = { bg: mixColor(CARD_BG, b.accent, 0.055), accent: b.accent };
      const lines: DrawLine[] = [];
      lines.push({ height: CARD_PAD, card, draw: () => {} }); // top padding
      // Title row (with optional right-aligned time and badge chip).
      const titleSize = 11.5;
      const titleH = titleSize * LEADING;
      const title = b.title;
      const right = b.titleRight || "";
      const badge = b.badge || "";
      lines.push({
        height: titleH,
        card,
        draw: (c, xLeft, yTop, width) => {
          const tx = xLeft + CARD_PAD;
          const baseTop = yTop + (titleH - titleSize) / 2;
          let rightEdge = xLeft + width - CARD_PAD;
          if (right) {
            const w = regular.widthOfText(right, 9);
            c.text(rightEdge - w, baseTop + (titleSize - 9) / 2, right, regular, 9, MUTED);
            rightEdge -= w + 8;
          }
          if (badge) {
            const w = bold.widthOfText(badge, 7.5);
            c.text(rightEdge - w, baseTop + (titleSize - 7.5) / 2, badge, bold, 7.5, b.accent);
            rightEdge -= w + 8;
          }
          const maxTitle = rightEdge - tx;
          let t = title;
          while (t && bold.widthOfText(t, titleSize) > maxTitle) t = t.slice(0, -1);
          if (t !== title && t.length > 1) t = t.slice(0, -1) + "…";
          c.text(tx, baseTop, t, bold, titleSize, INK);
        },
      });
      if (b.subtitle) lines.push(...textLines(b.subtitle, regular, 9, MUTED, { card }));
      // Detail rows: label (muted) + value (ink), value wraps with hanging indent.
      const labelW = 96;
      for (const row of b.rows) {
        const valueIndent = row.label ? labelW : 0;
        const avail = contentWidth - CARD_PAD * 2 - valueIndent;
        const size = 9.5;
        const lineH = size * LEADING;
        const wrapped = wrapText(row.value, regular, size, avail);
        wrapped.forEach((str, i) => {
          lines.push({
            height: lineH,
            card,
            draw: (c, xLeft, yTop) => {
              const baseTop = yTop + (lineH - size) / 2;
              if (i === 0 && row.label) c.text(xLeft + CARD_PAD, baseTop, row.label, regular, size, MUTED);
              c.text(xLeft + CARD_PAD + valueIndent, baseTop, str, regular, size, INK);
            },
          });
        });
      }
      if (b.notes) for (const note of b.notes) lines.push(...textLines(note, italic, 9, MUTED, { card }));
      lines.push({ height: CARD_PAD + 6, card, draw: () => {} }); // bottom padding + gap
      // Keep top-pad + title + subtitle(+1 row) together so a card never
      // strands just its heading at the foot of a page.
      const keepHead = Math.min(lines.length, 3 + (b.subtitle ? 1 : 0));
      blocks.push({ lines, keepHead });
      continue;
    }
  }

  // --- Paginate ------------------------------------------------------------
  let hasUnsupported = false;
  const pageCanvases: Canvas[] = [];
  let pageIndex = 0;
  let canvas = new Canvas(page.height);
  let y = topLimit;
  pageCanvases.push(canvas);

  const newPage = () => {
    canvas = new Canvas(page.height);
    pageCanvases.push(canvas);
    pageIndex++;
    y = topLimit;
  };

  const drawLine = (line: DrawLine) => {
    if (line.card) {
      canvas.fillRect(margin, y, contentWidth, line.height, line.card.bg);
      canvas.fillRect(margin, y, 3, line.height, line.card.accent);
    }
    line.draw(canvas, margin, y, contentWidth);
    y += line.height;
  };

  for (const block of blocks) {
    const totalH = block.lines.reduce((s, l) => s + l.height, 0);
    const remaining = bottomLimit - y;
    if (totalH <= remaining) {
      for (const l of block.lines) drawLine(l);
      continue;
    }
    // Won't fit whole. Make sure the head lines are not stranded.
    const headH = block.lines.slice(0, block.keepHead).reduce((s, l) => s + l.height, 0);
    if (headH > bottomLimit - y && y > topLimit) newPage();
    for (const l of block.lines) {
      if (y + l.height > bottomLimit && y > topLimit) newPage();
      drawLine(l);
    }
  }

  // --- Header / footer on every page --------------------------------------
  const totalPages = pageCanvases.length;
  pageCanvases.forEach((c, i) => {
    // Running header.
    c.text(margin, margin - 8, spec.headerLeft, regular, 8.5, FAINT);
    if (spec.headerRight) {
      const w = regular.widthOfText(spec.headerRight, 8.5);
      c.text(page.width - margin - w, margin - 8, spec.headerRight, regular, 8.5, FAINT);
    }
    c.line(margin, margin + 4, page.width - margin, HAIR, 0.6);
    // Footer: page numbers left, discreet identifier right.
    const pageLabel = `${i + 1} / ${totalPages}`;
    c.line(margin, page.height - margin - 14, page.width - margin, HAIR, 0.6);
    c.text(margin, page.height - margin - 10, pageLabel, regular, 8, FAINT);
    const fw = regular.widthOfText(spec.footer, 8);
    c.text(page.width - margin - fw, page.height - margin - 10, spec.footer, regular, 8, FAINT);
  });

  for (let i = 0; i < pageCanvases.length; i++) {
    builder.addPage(page.width, page.height, pageCanvases[i].toString());
  }

  hasUnsupported = regular.hasUnsupported || bold.hasUnsupported || italic.hasUnsupported;
  return { bytes: builder.build(), pageCount: totalPages, hasUnsupported };
}
