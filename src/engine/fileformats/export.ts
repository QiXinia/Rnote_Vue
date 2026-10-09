// Export engine content to PNG / JPEG / SVG. Renders through the same stroke
// draw methods used on screen, so exports match the canvas.

import { Vec2, Aabb } from '../../compose/geometry'
import { StrokeLayer } from '../../compose/style/options'
import type { Engine } from '../engine'
import { Layout } from '../document/layout'
import { downloadBytes, downloadText } from './gzip'

export type ExportRegion = 'selection' | 'page' | 'all-pages' | 'entire-document'

export type PageOrder = 'horizontal-first' | 'vertical-first'

export interface ExportPrefs {
  withBackground: boolean
  withPattern: boolean
  optimizePrinting: boolean
  pageOrder: PageOrder
}

export interface BitmapExportOptions extends ExportPrefs {
  region: ExportRegion
  format: 'png' | 'jpeg'
  dpi: number
  margin: number
}

export interface SvgExportOptions extends ExportPrefs {
  region: ExportRegion
  margin: number
}

function resolveRegion(engine: Engine, region: ExportRegion): Aabb | null {
  const doc = engine.document
  let bounds: Aabb | null = null
  if (region === 'selection') {
    bounds = engine.store.boundsSelected()
  } else if (region === 'page') {
    if (doc.layout === Layout.FixedSize) bounds = doc.pageBounds(0)
    else bounds = doc.pageBounds(0)
  } else if (region === 'all-pages') {
    if (doc.layout === Layout.FixedSize) bounds = doc.fixedBounds()
    else bounds = doc.pageBounds(0)
  } else {
    bounds = engine.contentBounds()
    if (bounds) {
      if (doc.layout === Layout.FixedSize) {
        bounds = doc.fixedBounds().union(bounds)
      } else {
        const page = doc.pageBounds(0)
        bounds = page.union(bounds)
      }
    } else {
      bounds = doc.pageBounds(0)
    }
  }
  if (!bounds || bounds.zero()) {
    // fall back to the first page
    bounds = doc.pageBounds(0)
  }
  return bounds
}

// Render a document region to an offscreen canvas at the requested scale.
// Shared by bitmap and PDF export so output is identical.
export function renderRegionToCanvas(
  engine: Engine,
  region: Aabb,
  opts: {
    scale: number
    withBackground: boolean
    withPattern?: boolean
    optimizePrinting?: boolean
    margin?: number
    onlySelection?: boolean
    clipToRegion?: boolean
  }
): { canvas: HTMLCanvasElement; bounds: Aabb } {
  const margin = opts.margin ?? 0
  const drawBounds = margin ? region.extend_by(margin) : region
  const scale = opts.scale
  const wPx = Math.max(1, Math.round(drawBounds.width() * scale))
  const hPx = Math.max(1, Math.round(drawBounds.height() * scale))

  const canvas = document.createElement('canvas')
  canvas.width = wPx
  canvas.height = hPx
  const ctx = canvas.getContext('2d')!
  if (opts.withBackground) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, wPx, hPx)
  }
  ctx.scale(scale, scale)
  ctx.translate(-drawBounds.min.x, -drawBounds.min.y)

  drawBackgroundForExport(engine, ctx, region, {
    withBackground: opts.withBackground,
    withPattern: opts.withPattern ?? true,
    optimizePrinting: opts.optimizePrinting ?? false
  })
  drawStrokesForExport(engine, ctx, !!opts.onlySelection)
  return { canvas, bounds: drawBounds }
}

export async function exportBitmap(engine: Engine, opts: BitmapExportOptions): Promise<void> {
  const region = resolveRegion(engine, opts.region)
  if (!region) throw new Error('Nothing to export')
  const { canvas } = renderRegionToCanvas(engine, region, {
    scale: opts.dpi / 96,
    withBackground: opts.withBackground || opts.format === 'jpeg',
    withPattern: opts.withPattern,
    optimizePrinting: opts.optimizePrinting,
    margin: opts.margin,
    onlySelection: opts.region === 'selection'
  })

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, opts.format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.95)
  )
  if (!blob) throw new Error('Encoding failed')
  const ext = opts.format === 'jpeg' ? 'jpg' : 'png'
  downloadBytes(`rnote-export.${ext}`, blob, blob.type)
}

// Enumerate per-page regions for multi-page PDF export (fixed layouts produce
// one region per page; other layouts yield a single content/page region).
export function exportRegions(engine: Engine, region: ExportRegion): Aabb[] {
  const doc = engine.document
  if (region === 'selection') {
    const b = engine.store.boundsSelected()
    return b && !b.zero() ? [b] : [doc.pageBounds(0)]
  }
  if (doc.layout === Layout.FixedSize && region !== 'entire-document') {
    if (region === 'page') return [doc.pageBounds(0)]
    return Array.from({ length: doc.pages }, (_, i) => doc.pageBounds(i))
  }
  const whole = resolveRegion(engine, region)
  return whole ? [whole] : [doc.pageBounds(0)]
}

function drawBackgroundForExport(
  engine: Engine,
  ctx: CanvasRenderingContext2D,
  region: Aabb,
  prefs: { withBackground: boolean; withPattern: boolean; optimizePrinting: boolean }
) {
  if (!prefs.withBackground) return
  const doc = engine.document
  if (doc.layout === Layout.FixedSize) {
    for (let i = 0; i < doc.pages; i++) {
      const b = doc.pageBounds(i)
      if (b.intersects(region)) doc.background.draw(ctx, b, prefs)
    }
  } else {
    doc.background.draw(ctx, region, prefs)
  }
}

function drawStrokesForExport(engine: Engine, ctx: CanvasRenderingContext2D, onlySelection: boolean) {
  const strokes = onlySelection ? engine.store.selectedStrokes() : engine.store.ordered()
  // Match the desktop chrono layer draw order.
  const layers = [StrokeLayer.Document, StrokeLayer.Image, StrokeLayer.Highlighter, StrokeLayer.UserLayer]
  for (const layer of layers) {
    for (const s of strokes) {
      if ((s.layer ?? StrokeLayer.UserLayer) !== layer) continue
      ctx.save()
      s.draw(ctx, 1)
      ctx.restore()
    }
  }
}

// Builds a standalone SVG document for one export region (page bounds). Strokes
// are filtered to those intersecting the region so multi-page exports only
// carry each page's content. Shared by SVG export and vector PDF export.
export function buildRegionSvg(
  engine: Engine,
  drawBounds: Aabb,
  o: { region: ExportRegion; withBackground: boolean; withPattern: boolean; optimizePrinting: boolean }
): string {
  const w = drawBounds.width()
  const h = drawBounds.height()
  const allStrokes =
    o.region === 'selection' ? engine.store.selectedStrokes() : engine.store.ordered()
  const strokes = allStrokes.filter((s) => {
    const fn = (s as any).intersectsAabb as ((b: Aabb) => boolean) | undefined
    return typeof fn === 'function' ? fn.call(s, drawBounds) : true
  })

  let inner = ''
  if (o.withBackground) {
    const bgOpts = { withPattern: o.withPattern, optimizePrinting: o.optimizePrinting }
    if (engine.document.layout === Layout.FixedSize) {
      for (let i = 0; i < engine.document.pages; i++) {
        const b = engine.document.pageBounds(i)
        if (b.intersects(drawBounds)) inner += engine.document.background.toSVG(b, bgOpts)
      }
    } else {
      inner += engine.document.background.toSVG(drawBounds, bgOpts)
    }
  }
  for (const s of strokes) {
    if (s.toSVG) {
      try {
        inner += s.toSVG()
      } catch (e) {
        console.warn('svg export failed for stroke', s.kind, e)
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${r(w)}" height="${r(h)}" viewBox="${r(drawBounds.min.x)} ${r(drawBounds.min.y)} ${r(w)} ${r(h)}">\n` +
    `<g>\n${inner}\n</g>\n</svg>\n`
  )
}

export async function exportSVG(engine: Engine, opts: SvgExportOptions): Promise<void> {
  const region = resolveRegion(engine, opts.region)
  if (!region) throw new Error('Nothing to export')
  const drawBounds = region.extend_by(opts.margin)
  const svg =
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n` +
    buildRegionSvg(engine, drawBounds, opts)
  downloadText('rnote-export.svg', svg, 'image/svg+xml')
}

// Port of Aabb.split_extended_origin_aligned: split bounds into origin-aligned
// pages of splitSize, in row-major (horizontal-first) or column-major order.
function splitExtendedOriginAligned(bounds: Aabb, splitSize: Vec2, order: PageOrder): Aabb[] {
  if (splitSize.x <= 0 || splitSize.y <= 0) return []
  const rowMajor = order === 'horizontal-first'
  const res: Aabb[] = []
  const outerSize = rowMajor ? splitSize.y : splitSize.x
  const innerSize = rowMajor ? splitSize.x : splitSize.y
  const outerMin = rowMajor ? bounds.min.y : bounds.min.x
  const outerMax = rowMajor ? bounds.max.y : bounds.max.x
  const innerMin = rowMajor ? bounds.min.x : bounds.min.y
  const innerMax = rowMajor ? bounds.max.x : bounds.max.y
  let offOuter = Math.floor(outerMin / outerSize) * outerSize
  while (offOuter < outerMax) {
    let offInner = Math.floor(innerMin / innerSize) * innerSize
    while (offInner < innerMax) {
      const min = rowMajor ? new Vec2(offInner, offOuter) : new Vec2(offOuter, offInner)
      res.push(new Aabb(min.clone(), min.add(new Vec2(splitSize.x, splitSize.y))))
      offInner += innerSize
    }
    offOuter += outerSize
  }
  return res
}

// Print via the browser, one printed sheet per document page for fixed-size
// layouts; infinite layouts are cut into format-sized sheets (the web
// equivalent of Rnote's print/export). Each sheet is rasterised at PRINT_DPI
// and laid out with a matching @page size so the print dialog maps one canvas
// to one sheet edge-to-edge.
const PRINT_DPI = 150

export function printDocument(engine: Engine, prefs?: Partial<ExportPrefs>) {
  const p: ExportPrefs = {
    withBackground: prefs?.withBackground ?? true,
    withPattern: prefs?.withPattern ?? true,
    optimizePrinting: prefs?.optimizePrinting ?? false,
    pageOrder: prefs?.pageOrder ?? 'horizontal-first'
  }
  const doc = engine.document
  let regions: Aabb[]
  if (doc.layout === Layout.FixedSize) {
    regions = Array.from({ length: doc.pages }, (_, i) => doc.pageBounds(i))
  } else {
    const whole = resolveRegion(engine, 'entire-document')
    if (!whole) return
    regions = splitExtendedOriginAligned(
      whole,
      new Vec2(doc.format.width, doc.format.height),
      p.pageOrder
    )
    if (!regions.length) regions = [whole]
  }
  if (!regions.length) return

  const scale = PRINT_DPI / 96
  const pages = regions.map((region) => {
    const { canvas } = renderRegionToCanvas(engine, region, {
      scale,
      withBackground: p.withBackground,
      withPattern: p.withPattern,
      optimizePrinting: p.optimizePrinting,
      margin: 0
    })
    return {
      url: canvas.toDataURL('image/png'),
      cssW: region.width(),
      cssH: region.height()
    }
  })

  const win = window.open('', '_blank')
  if (!win) {
    throw new Error('popup-blocked')
  }
  const title = (engine.fileName || 'Rnote Document').replace(/[<>"]/g, '')
  // All pages share the same sheet size in fixed-size layouts; for continuous
  // layouts @page size follows the (single) content region.
  const first = pages[0]
  const pageRule = `@page { size: ${r(first.cssW)}px ${r(first.cssH)}px; margin: 0; }`
  const imgs = pages
    .map(
      (p) =>
        `<div class="sheet" style="width:${r(p.cssW)}px;height:${r(p.cssH)}px">` +
        `<img alt="" src="${p.url}" style="width:${r(p.cssW)}px;height:${r(p.cssH)}px;display:block"/></div>`
    )
    .join('\n')
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>` +
      `html,body{margin:0;padding:0;background:#fff;} ` +
      pageRule +
      ` .sheet{margin:0;page-break-after:always;break-after:page;overflow:hidden;} ` +
      `.sheet:last-child{page-break-after:auto;break-after:auto;} ` +
      `@media screen{body{background:#888}.sheet{margin:12px auto;box-shadow:0 2px 12px rgba(0,0,0,.4);background:#fff;}}` +
      `</style></head><body>${imgs}` +
      `<script>function go(){try{window.focus()}catch(e){}setTimeout(function(){window.print()},150);}` +
      `if(document.readyState==='complete'){go()}else{window.onload=go}<\/script>` +
      `</body></html>`
  )
  win.document.close()
}

function r(v: number): number {
  return Math.round(v * 100) / 100
}

export { Vec2 }
