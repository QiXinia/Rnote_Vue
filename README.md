# Rnote — Vue Web Edition

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Deploy to GitHub Pages](https://github.com/QiXinia/Rnote_Vue/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/QiXinia/Rnote_Vue/actions/workflows/deploy-pages.yml)

**▶ Live demo:** <https://qixinia.github.io/Rnote_Vue/> (automatically built and
deployed from `main` by GitHub Actions).

A browser front-end re-implementation of the open-source handwriting / sketching
application [**Rnote**](https://github.com/flxzt/rnote) (Rust + GTK4 / libadwaita,
GPL-3.0), rebuilt with **Vue 3 + Vite + TypeScript + Pinia**. The goal is a
**1:1 port of the desktop application's architecture and interaction model**.

Upstream author: **Florian Rass (flxzt)**. This project is a web port of the
`rnote-compose`, `rnote-engine` and `rnote-ui` crates and is released under the
**GNU General Public License v3.0**, the same license as Rnote.

## Running

```bash
npm install
npm run dev              # development server
npm run build            # production build (outputs dist/)
npm run preview          # preview the production build
npm run type-check       # vue-tsc type checking
npm run verify:rnote    # structural regression on real/synthetic .rnote samples
npm run verify:desktop-export  # desktop schema tags + export→import round trip
npm run verify:rng       # Rust PCG64 / rand_distr / textured-dot reference vectors
```

The app is fully static with no back-end. A recent version of Chrome / Edge /
Firefox is recommended (it relies on `CompressionStream` and Pointer Events).

## Architecture mapping

| Desktop (Rust crate)        | This project (TS/Vue)                                   | Responsibility |
|---|---|---|
| `rnote-compose` (~8.1k LOC) | `src/compose/`                                          | Geometry (`Vec2` / `Aabb` / `Transform`), constraints, `PenPath` (plain/curved/shaper + variable-width outline), 13 shape builders, color / GNOME palette, brush styles (solid/marker/textured), rough hand-drawn renderer |
| `rnote-engine` (~21.7k LOC) | `src/engine/`                                           | Document/format/background/layout, camera, strokes (brush/shape/text/image), store & hit-testing, undo/redo (mergeable commands), the six pens, `.rnote` file format, bitmap/SVG export, image import, autosave |
| `rnote-ui` (~22.9k, GTK)    | `src/ui/` + `src/stores` + `src/composables`            | Vue components: main window/header/tabs, pen switcher, configuration sidebars for all six pens, color & width pickers, canvas/app menus, export/document-settings/shortcuts/about/confirmation dialogs, workspace browser, toasts |

Rendering targets piet/cairo and uses **Canvas 2D**. Text is laid out with a
custom rich-text engine drawn onto the canvas; a `contenteditable` overlay is
used while editing and `foreignObject` for SVG export. Variable-width brushes
are implemented as a *densely re-sampled center line + variable-width outline
polygon*. The rough hand-drawn style uses a bundled mulberry32-seeded renderer.

## Implemented features

- **Six pens** — Brush, Shaper, Typewriter, Eraser, Selector, Tools (`Ctrl+1..6`).
- **Brush** — solid / marker (highlighter) / textured styles. Solid and marker
  fill a variable-width outline following the desktop `PenPath` logic; the marker
  is tagged by the chrono `highlighter` layer, drawn with constant pressure in
  its stored color and composited below normal strokes. Textured brushes support
  dot/line patterns with four distributions. Paths support plain/curved/shaper
  modes, six pressure curves and flat/round line caps. Shapes support the five
  piet dash parameters; the brush itself intentionally has no dash UI, matching
  the Rust render path.
- **Shapes** — line, arrow, rectangle, ellipse, focus ellipse, quadratic/cubic
  Bézier, polyline, polygon, coordinate grids, and 2D / quadrant-2D / 3D
  coordinate systems (13 builders total); smooth and rough rendering (with
  hachure fill and roughness), fill color, line style, Shift constraints
  (horizontal/vertical/1:1) and a highlight mode.
- **Typewriter** — font family, size, weight and color; bold/italic/underline/
  strikethrough; four alignments; adjustable text width; double-click to edit.
- **Eraser** — delete intersecting strokes or split intersecting strokes, with
  adjustable width; temporary switch via the stylus eraser nib/button.
- **Selector** — polygon/rectangle/single-click/intersecting-path marquees,
  move/scale/rotate handles, arrow-key nudging, duplicate/cut/copy/paste,
  duplicate-in-place, invert colors, delete, and aspect-ratio locking.
- **Tools** — vertical space, pan view (hand), zoom, laser pointer.
- **Document** — fixed-size / semi-infinite / infinite / continuous-vertical
  layouts; A3–A6, Letter, Legal and custom sizes; orientation toggle, DPI,
  multiple pages, border toggle; background color plus six patterns
  (lines/grid/dots/isometric) with adjustable spacing and color.
- **Files** — save/open the gzip-compressed `.rnote` container, save-as, import
  bitmap and SVG, export PNG/JPEG (optional region/DPI/background/margin),
  export SVG, **PDF export (jsPDF, paginated) and PDF import (pdf.js, rasterized
  page by page)**, **page-by-page printing (150 DPI rasterization + `@page`
  paper sizes, paginated for fixed layouts)**, clear document, autosave and
  crash recovery (localStorage for small documents, IndexedDB for large ones),
  and a workspace list of recent documents.
- **Pressure-sensitive stylus** — reads PointerEvent `pressure / tiltX / tiltY /
  twist / tangentialPressure`, replays high-density `getCoalescedEvents()`
  samples (per-point pressure) and preserves the raw stylus pressure. Pressure
  is mapped to outline width directly with the Rust `PressureCurve::apply`.
  Mouse/touch use the desktop default `Element::PRESSURE_DEFAULT = 0.5`. The
  eraser nib (`button === 5` / eraser button) switches tools temporarily.
- **Vector images** — SVG is imported as a true vector stroke and rasterized to
  an off-screen cache adapted to the current zoom/DPR (re-rasterized crisply on
  zoom-in, HiDPI screens and printing). It is inlined as a positioned nested
  `<svg>` on SVG export, and `vectorimage` strokes (`svg_data` +
  rectangle/cuboid/affine) from desktop `.rnote` files can be imported.
- **Mobile touch** — single-finger drawing (toggleable; when off, one finger
  pans), two-finger pinch-zoom and pan, automatic cancellation of the current
  stroke when a second finger lands, `touch-action: none`, pull-to-refresh /
  bounce suppression, safe-area (notch/home-indicator) handling, and a
  narrow-screen responsive layout (bottom pen capsule, 82vw option sheet,
  enlarged touch targets, collapsed option panels).
- **View / interaction** — multiple tabs, light/dark/system themes, focus mode,
  workspace browser, `Ctrl+wheel` zoom, pinch gestures, space/middle-mouse/Alt
  panning, a full shortcut set (press F1; includes `Ctrl+P` print) and toasts.
- **Internationalization** — UI language is selectable; translations are taken
  from the upstream Rnote `.po` catalogs.

## Native desktop `.rnote` writer (0.15 bidirectional compatibility)

Save writes the native Rnote 0.15 container rather than a web-only archive:
`gzip({"version":"0.15.0","data":{"engine_snapshot":{...}}})`. The snapshot
contains `document`, `camera`, parallel `stroke_components` /
`chrono_components`, and `chrono_counter`, using the same serde tags as the Rust
desktop application. Brush strokes (smooth/marker/textured), every native shape
primitive, text strokes, vector images and bitmap images are covered. Raster
pixels are raw RGBA with the desktop `R8g8b8a8Premultiplied` tag. This mirrors
Rust's encoded-image path (`Image::try_from_encoded_bytes` →
`DynamicImage::into_rgba8`), which stores canvas/PNG straight-alpha bytes;
Cairo-rendered premultiplied payloads are also detected on import. Web-only
composite/arrow/texture extensions degrade to the closest native representation;
multi-shape builders flatten into multiple shape strokes.

Document bounds follow the Rust `resize_doc_fixed_size_layout`,
`resize_doc_continuous_vertical_layout`, `resize_doc_semi_infinite_layout` and
`resize_doc_infinite_layout` formulas (pages are origin-aligned at `(0,0)` and
packed with no gap). Camera serialization includes the desktop `offset` /
`size` / `zoom` fields, where `offset` is in surface (screen logical-pixel)
coordinates with default `(-96,-96)`, default size `(800,600)` and a zoom range
of `0.2–6.0`.

Smooth brush rendering follows `compose_lines_variable_width`: it is a filled
variable-width outline and intentionally has no line-style/line-cap UI. Shape
dashes remain available in the shape sidebar. Arrow geometry and bounds follow
the desktop open-chevron constants (`10*(1+0.18*width)` tip length and a
`13π/16` stem angle).

### Regression commands

- `npm run verify:desktop-export` — desktop schema tags and export→import round trip.
- `npm run verify:rnote` — ten real desktop `.rnote` samples.
- `npm run verify:rng` — Rust PCG64 / rand_distr / textured-dot reference vectors.

## Desktop `.rnote` import

Implemented against the Rust serde model and verified with real samples across
versions. It parses the gzip JSON container (the 0.9+
`{version,data:{engine_snapshot}}` shape and the 0.5.x
`data.stroke_components` / `data.store_snapshot.stroke_components` shapes) and
maps all five stroke kinds:

- **Brush** — the new path `{start,segments(lineto/quadbezto/cubbezto)}` and the
  **0.5.x legacy path** (segment arrays `dot/line/cubbez`, control points as
  bare vectors); curve flatten points are linearly interpolated between the
  endpoint pressures; smooth/textured styles.
- **Layers** — versioned entries in `chrono_components` are unwrapped and sorted
  in desktop order (Document → Image → Highlighter → UserLayer), then by time
  `t` within a layer; markers use the highlighter layer as the authoritative
  source.
- **Shapes** — all eight builders: line / arrow (`tip`, open chevron) / rect /
  ellipse (affine including rotation and non-uniform scale) / quadbez / cubbez /
  polyline / polygon (bare-vector `path`, closed or open); smooth and rough
  styles; solid/hachure/**crosshatch** fills (zig-zag/dots/dashed fall back to
  hachure); solid/dotted/dashed_narrow/equidistant/wide line styles; line caps;
  const/linear/sqrt/cbrt/pow2/pow3 pressure curves.
- **Text** — color, font size, weight, alignment, `max_width`, and ranged
  italic/bold/underline/strikethrough.
- **Bitmap** — desktop raw **premultiplied RGBA** pixels are decoded back to PNG
  (already-encoded PNG/JPEG is also accepted).
- **Vector images** — inline SVG positioned via `cuboid.half_extents` and the
  column-major `affine`/`transform` (a 6-element array or a wrapped 3×3 matrix).

Verified end-to-end against the official samples 0.5.5 / 0.5.13 / 0.6.0 / 0.9.0
/ 0.14.2 / 0.15.0 plus lecture_note_1/2, overview and pdf_annotation (ten
files in total). `npm run verify:rnote` runs both synthetic schema cases
(lineto/quad/cubic, the eight shapes, markers, vector affine, legacy rough
enums) and the real samples, asserting stroke counts, styles, shape primitives,
chrono layers, key fields and bounds.

## Project layout

```
src/
  compose/        # geometry, shapes, pen paths, render styles (ports rnote-compose)
  engine/         # document, camera, strokes, store, history, pens, file formats
    fileformats/  # gzip/.rnote, export, import, autosave
    render/       # Canvas2D renderer
  ui/             # Vue components (ports rnote-ui)
  stores/app.ts   # Pinia: tabs, engine instances, dialogs, theme, file actions
  composables/canvas-controller.ts  # pointer/gesture/wheel/shortcut/text overlay
```

## Differences from the desktop version (platform limitations)

- **System fonts** — the typewriter and UI use a cross-platform system font
  stack (Latin plus Chinese faces: PingFang/Microsoft YaHei/Source Han/Serif/
  Kai and more). Canvas drawing, the contenteditable overlay and SVG/
  foreignObject/PDF export share one font resolver. The font dropdown lists
  common system fonts and can optionally load locally installed fonts via the
  Chromium Local Font Access API (permission-gated; silently falls back).
- **PDF** — export is paginated vector/bitmap via jsPDF and import is rasterized
  page by page via pdf.js; complex vectors and an optional text layer still lag
  native Poppler. Printing relies on the browser print dialog (`window.print`)
  with paper sizes controlled by `@page`.
- **Workspace filesystem** — the desktop reads/writes a workspace directory on
  disk; the web edition uses downloads/file pickers plus localStorage and could
  later be enhanced with the File System Access API (with fallbacks).
- **Pressure** — depends on the hardware/browser-reported `PointerEvent.pressure`;
  non-pressure mouse/touch input is recorded at the desktop Rust default of 0.5,
  giving a subjective width of half the nominal width under a linear curve. Pens
  and browsers vary in how accurately they report tilt, twist and tangential
  pressure.
- **SVG CJK fonts** — vector-image rasterization depends on fonts available to
  the browser and falls back when a font is missing; exported inline SVG does
  not embed fonts.
- **Rendering fidelity** — smooth brushes, marker layers, pressure width, shape
  dashes, arrows, basic rough parameters, vector-image affine transforms and
  layer ordering follow the Rust formulas; the textured-brush PCG RNG, area
  counting and Normal/Exponential sampling are currently a close visual
  approximation rather than a pixel-exact match.
- **Advanced capabilities not yet covered** — full stroke grouping/layer
  editing, selection alignment aids, componentized elements and the complete
  set of boolean operations on vector selections; interfaces are reserved in
  the roadmap.

## License

Copyright © 2024–2026 the Rnote Web contributors.

This program is free software: you can redistribute it and/or modify it under
the terms of the **GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version**.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU General Public License for more details. You
should have received a copy of the GNU General Public License along with this
program; see [LICENSE](LICENSE).

This is a derivative work of [Rnote](https://github.com/flxzt/rnote) by
Florian Rass and other Rnote contributors, used under GPL-3.0. All upstream
design, algorithms and the `.rnote` format remain the property of their
respective authors.
