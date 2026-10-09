// Import raster images and SVG vector images into the document, placed at a
// document position (or the viewport centre). PDF import is handled separately
// via pdf.js when available (see workspaces / open dialog).

import { Vec2, Aabb } from '../../compose/geometry'
import type { Engine } from '../engine'
import { BitmapImageStroke, VectorImageStroke, loadImage } from '../strokes/imagestroke'
import { svgToDataUrl } from '../strokes/imagestroke'
import { TextStroke, TextStyle } from '../strokes/textstroke'

export interface ImportResult {
  added: number
  kind: 'bitmap' | 'vector' | 'unknown'
}

export async function importImageFile(engine: Engine, file: File, atDoc?: Vec2): Promise<ImportResult> {
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
  const position = atDoc ?? engine.camera.screenToDoc(engine.camera.viewportSize.mul(0.5))
  if (isSvg) {
    const source = await file.text()
    const stroke = await VectorImageStroke.create(normalizeSvg(source), position)
    centerStrokeAt(stroke, position)
    engine.commitAddStrokes([stroke])
    return { added: 1, kind: 'vector' }
  }
  if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)) {
    const dataUrl = await readAsDataURL(file)
    const stroke = await BitmapImageStroke.create(dataUrl, new Vec2(0, 0))
    fitAndPlace(stroke, engine, position)
    engine.commitAddStrokes([stroke])
    return { added: 1, kind: 'bitmap' }
  }
  return { added: 0, kind: 'unknown' }
}

function fitAndPlace(stroke: BitmapImageStroke, engine: Engine, center: Vec2) {
  // scale very large images down to a comfortable fraction of the viewport
    const view = engine.camera.visibleDocBounds()
  const maxW = view.width() * 0.7
  const maxH = view.height() * 0.7
  const b = stroke.bounds()
  let s = 1
  if (b.width() > maxW || b.height() > maxH) s = Math.min(maxW / b.width(), maxH / b.height())
  if (s !== 1) {
    const w = b.width() * s
    const h = b.height() * s
    stroke.rect = new Aabb(center.sub(new Vec2(w / 2, h / 2)), center.add(new Vec2(w / 2, h / 2)))
  } else {
    const w = b.width()
    const h = b.height()
    stroke.rect = new Aabb(center.sub(new Vec2(w / 2, h / 2)), center.add(new Vec2(w / 2, h / 2)))
  }
}

function centerStrokeAt(stroke: VectorImageStroke, center: Vec2) {
  const b = stroke.bounds()
  const w = b.width()
  const h = b.height()
  stroke.rect = new Aabb(center.sub(new Vec2(w / 2, h / 2)), center.add(new Vec2(w / 2, h / 2)))
}

export async function importTextFile(engine: Engine, file: File, atDoc?: Vec2): Promise<ImportResult> {
  const text = await file.text()
  if (!text.trim()) return { added: 0, kind: 'unknown' }
  const pos = atDoc ?? engine.camera.screenToDoc(engine.camera.viewportSize.mul(0.5))
  const style = new TextStyle()
  style.family = engine.pensConfig.typewriter.family
  style.size = engine.pensConfig.typewriter.fontSize
  style.weight = engine.pensConfig.typewriter.weight
  style.italic = engine.pensConfig.typewriter.italic
  style.underline = engine.pensConfig.typewriter.underline
  style.strike = engine.pensConfig.typewriter.strike
  style.alignment = engine.pensConfig.typewriter.alignment
  style.color = engine.pensConfig.typewriter.color.clone()
  const html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')
  const stroke = new TextStroke(html, pos, engine.pensConfig.typewriter.textWidth, style)
  engine.commitAddStroke(stroke)
  return { added: 1, kind: 'unknown' }
}

function normalizeSvg(source: string): string {
  if (source.includes('<svg')) return source
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">${source}</svg>`
}

function readAsDataURL(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function imageElementFromDataUrl(url: string): Promise<HTMLImageElement> {
  return loadImage(url)
}

export { svgToDataUrl }
