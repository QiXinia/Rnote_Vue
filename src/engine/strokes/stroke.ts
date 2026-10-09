// Port of rnote-engine strokes/stroke.rs: common Stroke behaviour.

import { Vec2, Aabb, Transform } from '../../compose/geometry'
import { StrokeLayer } from '../../compose/style/options'

export interface StrokeHitContext {
  tolerance: number
  zoom: number
}

export interface StrokeJSON {
  id?: number
  kind: string
  [key: string]: any
}

export interface Stroke {
  readonly kind: string
  id: number
  layer?: StrokeLayer | string
  bounds(): Aabb
  draw(ctx: CanvasRenderingContext2D, zoom?: number): void
  toSVG?(): string
  translate(d: Vec2): void
  transform(t: Transform): void
  hitTest(p: Vec2, ctx: StrokeHitContext): boolean
  intersectsAabb(box: Aabb): boolean
  invertColors?(): void
  duplicate(): Stroke
  toJSON(): StrokeJSON
  // Optional raster warm-up for first-render frame budgeting.
  warm?(eff: number): void
  isWarm?(eff: number): boolean
  // Whether any raster sprite currently exists (even at a lower resolution
  // bucket), so the renderer can draw that soft sprite instead of nothing while
  // a budgeted upgrade is deferred.
  hasRaster?(): boolean
}

export function strokeBounds(strokes: Stroke[]): Aabb | null {
  let b: Aabb | null = null
  for (const s of strokes) {
    const sb = s.bounds()
    if (sb.zero()) continue
    b = b ? b.union(sb) : sb
  }
  return b
}
