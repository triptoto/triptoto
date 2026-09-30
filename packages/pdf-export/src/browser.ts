// Public browser entry point for the trip PDF exporter.
//
// Exposes a single, trip-agnostic `render` function on the global
// `TriptoPdfExport`. The caller (the app shell) is responsible for gathering
// trip data, applying privacy settings and fetching the embeddable fonts; this
// module only knows how to lay out a generic block list into a PDF.

import { render, type RenderSpec, type RenderResult, type LayoutBlock, type RGB } from "./layout.ts";

export type { RenderSpec, RenderResult, LayoutBlock, RGB };

Object.assign(globalThis, {
  TriptoPdfExport: Object.freeze({
    render(spec: RenderSpec): RenderResult {
      return render(spec);
    },
  }),
});
