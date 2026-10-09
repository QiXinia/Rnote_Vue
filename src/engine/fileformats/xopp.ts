// Xournal++ .xopp importer, aligned with rnote-engine
// engine/snapshot.rs::load_from_xopp_bytes and fileformats/xoppformat.rs.
// A .xopp file is gzip-compressed XML using 72 DPI coordinates. Rnote imports
// pages into one vertical global coordinate space at the configured 96 DPI.

import { Engine, type EngineSnapshot } from '../engine'
import { Vec2 } from '../../compose/geometry'
import { Aabb } from '../../compose/geometry/aabb'
import { Color } from '../../compose/style/color'
import { StrokeLayer } from '../../compose/style/options'
import { PenPath, Element as PenElement, PenPathBuilderType } from '../../compose/penpath/penpath'
import { SmoothOptions, TexturedOptions, PressureCurve } from '../../compose/style/options'
import { BrushStroke, BrushStyleKind } from '../strokes/brushstroke'
import { TextStroke, TextStyle } from '../strokes/textstroke'
import { BitmapImageStroke, VectorImageStroke, loadImage } from '../strokes/imagestroke'
import { PatternStyle } from '../document/background'
import { Layout } from '../document/layout'
import type { Stroke } from '../strokes/stroke'
import { gzipDecompress, isGzip, readFileBytes, gzipCompress, downloadBytes } from './gzip'
import { applyPressureCurve } from '../../compose/style/options'

const XOPP_DPI = 72
const IMPORT_DPI = 96
const SCALE = IMPORT_DPI / XOPP_DPI
let currentScale = SCALE

interface XoppColor { r: number; g: number; b: number; a: number }

interface XoppStroke {
  tool: 'pen' | 'highlighter' | 'eraser'
  color: XoppColor
  widths: number[]
  coords: Vec2[]
}

interface XoppText {
  font: string
  size: number
  x: number
  y: number
  color: XoppColor
  text: string
}

interface XoppImage {
  bounds: Aabb
  data: string
}

export async function importXoppFile(
  file: File | Blob,
  dpi = IMPORT_DPI
): Promise<{ snapshot: EngineSnapshot; title: string }> {
  currentScale = dpi / XOPP_DPI
  const bytes = await readFileBytes(file)
  const xml = isGzip(bytes) ? await gzipDecompress(bytes) : new TextDecoder().decode(bytes)
  const root = parseXml(xml)
  const title = root.getElementsByTagName('title')[0]?.textContent?.trim() || 'Xournal++ Document'
  const pages = Array.from(root.getElementsByTagName('page'))

  let docWidth = 0
  let docHeight = 0
  for (const page of pages) {
    const w = num(page.getAttribute('width'))
    const h = num(page.getAttribute('height'))
    docWidth = Math.max(docWidth, w)
    docHeight += h
  }

  const engine = new Engine()
  engine.document.format.setDpi(dpi)
  engine.document.format.setWidth(scale(docWidth))
  engine.document.format.setHeight(scale(docHeight / Math.max(pages.length, 1)))
  // Rnote currently ignores XOPP background patterns/styles and imports solid
  // backgrounds as plain documents.
  engine.document.background.pattern = PatternStyle.None

  const strokes: (BrushStroke | TextStroke | BitmapImageStroke)[] = []
  const origin = new Vec2(-scale(docWidth) / 2, -scale(docHeight) / 2)
  let pageOffsetY = 0
  for (const page of pages) {
    const pageH = scale(num(page.getAttribute('height')))
    const offset = new Vec2(origin.x, origin.y + pageOffsetY)

    for (const node of Array.from(page.getElementsByTagName('stroke'))) {
      const stroke = parseStroke(node)
      if (stroke) strokes.push(brushFromXopp(stroke, offset))
    }
    for (const node of Array.from(page.getElementsByTagName('text'))) {
      const text = parseText(node)
      if (text) strokes.push(textFromXopp(text, offset))
    }
    for (const node of Array.from(page.getElementsByTagName('image'))) {
      const image = parseImage(node, offset)
      if (image) {
        try {
          const dataUrl = `data:image/png;base64,${image.data.replace(/\s+/g, '')}`
          const bmp = await BitmapImageStroke.create(dataUrl, image.bounds.min)
          bmp.rect = image.bounds
          strokes.push(bmp)
        } catch (e) {
          console.warn('Failed to import XOPP image', e)
        }
      }
    }
    pageOffsetY += pageH
  }

  // Import directly without history, matching Engine::take_snapshot().
  engine.store.addStrokes(strokes)
  const bounds = engine.contentBounds()
  if (bounds) engine.camera.fitBounds(bounds, 48)
  return { snapshot: engine.snapshot(), title }
}

export async function exportXopp(engine: Engine): Promise<void> {
  const bytes = await gzipCompress(await buildXoppXml(engine))
  downloadBytes(`${engine.fileName || 'rnote'}.xopp`, bytes, 'application/x-xopp')
}

async function buildXoppXml(engine: Engine): Promise<string> {
  const dpi = engine.document.format.dpi || IMPORT_DPI
  const toXopp = 72 / dpi
  const pageBounds = collectExportPages(engine)
  const pages: string[] = []

  for (const bounds of pageBounds) {
    const inPage = engine.store.ordered().filter((s) => s.intersectsAabb(bounds))
    const imageTags: string[] = []
    const strokeTags: string[] = []

    for (const original of inPage) {
      const stroke = original.duplicate()
      stroke.translate(new Vec2(-bounds.min.x, -bounds.min.y))
      if (stroke.kind === 'brush') {
        const tag = brushToXoppTag(stroke as BrushStroke, toXopp)
        if (tag) strokeTags.push(tag)
      } else {
        const tag = await rasterStrokeToXoppImage(stroke, toXopp)
        if (tag) imageTags.push(tag)
      }
    }

    const w = bounds.width() * toXopp
    const h = bounds.height() * toXopp
    const bg = engine.document.background.color.toHex()
    pages.push(
      `<page width="${fmt(w)}" height="${fmt(h)}">` +
        `<background type="solid" color="${bg.length === 7 ? bg + 'ff' : bg}" style="plain"/>` +
        (imageTags.length ? `<layer>${imageTags.join('')}</layer>` : '') +
        (strokeTags.length ? `<layer>${strokeTags.join('')}</layer>` : '') +
        `</page>`
    )
  }

  const title = 'Xournal++ document - see https://github.com/xournalpp/xournalpp (exported from Rnote Vue)'
  return `<?xml version="1.0" standalone="no"?>\n<xournal fileversion="4"><title>${xmlEscape(title)}</title>${pages.join('')}</xournal>`
}

function collectExportPages(engine: Engine): Aabb[] {
  if (engine.document.layout === Layout.FixedSize) {
    return Array.from({ length: engine.document.pages }, (_, i) => engine.document.pageBounds(i))
  }
  const content = engine.contentBounds()
  return [content ?? engine.document.pageBounds(0)]
}

function brushToXoppTag(stroke: BrushStroke, scale: number): string | null {
  const points = stroke.penPath.rawPoints()
  if (points.length < 2) return null
  const textured = stroke.styleKind === BrushStyleKind.Textured
  const options = textured ? stroke.textured : stroke.smooth
  const color = options.stroke_color
  if (!color) return null
  const baseWidth = options.stroke_width * scale
  const widths = [baseWidth]
  for (const p of stroke.penPath.elements) {
    const factor = textured
      ? p.pressure
      : applyPressureCurve(p.pressure, stroke.smooth.pressure_curve)
    widths.push(options.stroke_width * scale * factor)
  }
  const coords = points.map((p) => `${fmt(p.x * scale)} ${fmt(p.y * scale)}`).join(' ')
  const hex = color.toHex()
  return `<stroke tool="pen" color="${hex.length === 7 ? hex + 'ff' : hex}" width="${widths.map(fmt).join(' ')}">${coords}</stroke>`
}

async function rasterStrokeToXoppImage(stroke: Stroke, scale: number, rasterScale = 2): Promise<string | null> {
  let bounds = stroke.bounds().extend_by(8)
  if (bounds.width() < 1 || bounds.height() < 1) bounds = bounds.extend_by(8)
  if ((stroke as any).dataUrl) {
    const img = await loadImage((stroke as any).dataUrl)
    ;(stroke as any).image = img
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(bounds.width() * rasterScale))
  canvas.height = Math.max(1, Math.ceil(bounds.height() * rasterScale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(rasterScale, rasterScale)
  ctx.translate(-bounds.min.x, -bounds.min.y)
  stroke.draw(ctx as CanvasRenderingContext2D, 1)
  const data = canvas.toDataURL('image/png').split(',')[1] ?? ''
  const left = bounds.min.x * scale
  const top = bounds.min.y * scale
  const right = bounds.max.x * scale
  const bottom = bounds.max.y * scale
  return `<image left="${fmt(left)}" top="${fmt(top)}" right="${fmt(right)}" bottom="${fmt(bottom)}">${data}</image>`
}

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const error = doc.getElementsByTagName('parsererror')[0]
  if (error) throw new Error('Invalid XOPP XML')
  const root = doc.documentElement
  if (!root || root.tagName.toLowerCase() !== 'xournal') throw new Error('Missing XOPP <xournal> root')
  return doc
}

function parseStroke(node: Element): XoppStroke | null {
  const toolAttr = node.getAttribute('tool') || 'pen'
  if (toolAttr !== 'pen' && toolAttr !== 'highlighter' && toolAttr !== 'eraser') return null
  const color = parseStrokeColor(node.getAttribute('color') || '#000000ff')
  const widths = (node.getAttribute('width') || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite)
  const nums = (node.textContent || '')
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter(Number.isFinite)
  const coords: Vec2[] = []
  for (let i = 0; i + 1 < nums.length; i += 2) coords.push(new Vec2(scale(nums[i]), scale(nums[i + 1])))
  if (!widths.length || coords.length < 1) return null
  return { tool: toolAttr, color, widths, coords }
}

function brushFromXopp(x: XoppStroke, offset: Vec2): BrushStroke {
  const declaredWidths = x.widths.map(scale)
  let strokeWidth = declaredWidths.shift() ?? 2
  let pressures: number[]
  const variableWidths = declaredWidths.slice(0, x.coords.length)
  if (variableWidths.length) {
    const maxWidth = variableWidths.reduce((m, v) => Math.max(m, v), Number.EPSILON)
    strokeWidth = maxWidth
    pressures = variableWidths.map((w) => Math.max(0, Math.min(1, w / maxWidth)))
  } else {
    pressures = x.coords.map(() => 1)
  }
  while (pressures.length < x.coords.length) pressures.push(1)

  const path = new PenPath(
    x.coords.map((p, i) => new PenElement(p.add(offset), pressures[i])),
    PenPathBuilderType.Simple
  )
  const smooth = new SmoothOptions()
  smooth.stroke_width = strokeWidth
  smooth.pressure_curve = PressureCurve.Linear
  const color = Color.fromRgba8(x.color.r, x.color.g, x.color.b, x.color.a)
  if (x.tool === 'highlighter') color.a = 0.5
  if (x.tool === 'eraser') color.r = color.g = color.b = 1
  smooth.stroke_color = color
  const stroke = new BrushStroke(path, BrushStyleKind.Solid, smooth, new TexturedOptions())
  stroke.layer = x.tool === 'highlighter' ? StrokeLayer.Highlighter : StrokeLayer.UserLayer
  return stroke
}

function parseText(node: Element): XoppText | null {
  const font = node.getAttribute('font') || 'serif'
  const size = num(node.getAttribute('size'))
  const x = num(node.getAttribute('x'))
  const y = num(node.getAttribute('y'))
  const color = parseStrokeColor(node.getAttribute('color') || '#000000ff')
  const text = node.textContent || ''
  if (!text) return null
  return { font, size: scale(size), x: scale(x), y: scale(y), color, text }
}

function textFromXopp(x: XoppText, offset: Vec2): TextStroke {
  const style = new TextStyle()
  style.family = normalizeFont(x.font)
  style.size = x.size
  style.color = Color.fromRgba8(x.color.r, x.color.g, x.color.b, x.color.a)
  const pos = new Vec2(x.x, x.y).add(offset)
  const width = measureTextWidth(x.text, style.family, style.size)
  return new TextStroke(escapeHtml(x.text), pos, width, style)
}

function parseImage(node: Element, pageOffset: Vec2): XoppImage | null {
  const left = scale(num(node.getAttribute('left')))
  const top = scale(num(node.getAttribute('top')))
  const right = scale(num(node.getAttribute('right')))
  const bottom = scale(num(node.getAttribute('bottom')))
  const data = (node.textContent || '').trim()
  if (!data || right <= left || bottom <= top) return null
  const min = new Vec2(left, top).add(pageOffset)
  const max = new Vec2(right, bottom).add(pageOffset)
  return { bounds: new Aabb(min, max), data }
}

function parseStrokeColor(value: string): XoppColor {
  const named: Record<string, XoppColor> = {
    black: { r: 0, g: 0, b: 0, a: 255 },
    blue: { r: 0x33, g: 0x33, b: 0xcc, a: 255 },
    red: { r: 0xff, g: 0, b: 0, a: 255 },
    green: { r: 0, g: 0x80, b: 0, a: 255 },
    gray: { r: 0x80, g: 0x80, b: 0x80, a: 255 },
    lightblue: { r: 0x80, g: 0xc0, b: 0xff, a: 255 },
    lightgreen: { r: 0, g: 0xff, b: 0, a: 255 },
    magenta: { r: 0xff, g: 0, b: 0xff, a: 255 },
    orange: { r: 0xff, g: 0x80, b: 0, a: 255 },
    yellow: { r: 0xff, g: 0xff, b: 0xf0, a: 255 },
    white: { r: 255, g: 255, b: 255, a: 255 }
  }
  if (named[value]) return named[value]
  let hex = value.replace('#', '')
  if (hex.length === 6) hex += 'ff'
  const n = parseInt(hex, 16)
  if (!Number.isFinite(n) || hex.length !== 8) return named.black
  return { r: (n >>> 24) & 255, g: (n >>> 16) & 255, b: (n >>> 8) & 255, a: n & 255 }
}

function normalizeFont(font: string): string {
  const f = font.trim().split(/\s*,\s*/)[0].replace(/^["']|["']$/g, '')
  return f || 'serif'
}
function scale(v: number): number { return v * currentScale }
function num(v: string | null): number { const n = Number(v); return Number.isFinite(n) ? n : 0 }
function fmt(v: number): string { return (Math.round(v * 1000) / 1000).toString() }
function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function measureTextWidth(text: string, family: string, size: number): number {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return Math.max(1, text.length * size * 0.6)
  ctx.font = `${size}px ${family}`
  return Math.max(1, ctx.measureText(text).width)
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
