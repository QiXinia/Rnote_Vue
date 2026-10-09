// Port of rnote-engine strokes/shapestroke.rs. A shape stroke holds one or
// more compose shapes (composite builders emit several primitives) that share
// a smooth or rough style.

import { Vec2, Aabb, Transform } from '../../compose/geometry'
import {
  Shape,
  ShapeStyle,
  shapeFromJSON,
  distPointSegment,
  pointInPolygon
} from '../../compose/shapes/shape'
import { SmoothOptions } from '../../compose/style/options'
import { RoughOptions } from '../../compose/style/options'
import { StrokeLayer } from '../../compose/style/options'
import type { Stroke, StrokeHitContext, StrokeJSON } from './stroke'
import { nextStrokeId } from './next-id'

export class ShapeStroke implements Stroke {
  kind = 'shape' as const
  id: number
  shapes: Shape[]
  smooth: SmoothOptions
  rough: RoughOptions
  roughEnabled: boolean
  highlightMode: boolean
  highlightOpacity: number
  layer: StrokeLayer = StrokeLayer.UserLayer

  constructor(shapes: Shape[], opts: {
    smooth: SmoothOptions
    rough: RoughOptions
    roughEnabled?: boolean
    highlightMode?: boolean
    highlightOpacity?: number
    id?: number
  }) {
    this.id = opts.id ?? nextStrokeId()
    this.shapes = shapes
    this.smooth = opts.smooth
    this.rough = opts.rough
    this.roughEnabled = opts.roughEnabled ?? false
    this.highlightMode = opts.highlightMode ?? false
    this.highlightOpacity = opts.highlightOpacity ?? 0.45
    if (opts.highlightMode) this.layer = StrokeLayer.Highlighter
  }

  private shapeStyle(): ShapeStyle {
    return { stroke: this.smooth, rough: this.rough, roughEnabled: this.roughEnabled }
  }

  bounds(): Aabb {
    const width = this.smooth.stroke_width
    let b: Aabb | null = null
    for (const s of this.shapes) {
      // Arrow has a width-dependent tip length (Rust internal_compute_bounds);
      // other shapes are loosened by the stroke width like composed_bounds.
      const sb =
        s.kind === 'arrow'
          ? (s as unknown as { composedBounds(w: number): Aabb }).composedBounds(width)
          : s.bounds().extend_by(width)
      b = b ? b.union(sb) : sb
    }
    return b ?? new Aabb()
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save()
    if (this.highlightMode) {
      ctx.globalAlpha = this.highlightOpacity
      ctx.globalCompositeOperation = 'multiply'
    }
    for (const s of this.shapes) s.draw(ctx, this.shapeStyle())
    ctx.restore()
  }

  toSVG(): string {
    const style = this.shapeStyle()
    let inner = this.shapes.map((s) => s.toSVG(style)).join('')
    if (this.highlightMode) {
      return `<g opacity="${this.highlightOpacity}">${inner}</g>`
    }
    return inner
  }

  translate(d: Vec2) {
    for (const s of this.shapes) s.translate(d)
  }
  transform(t: Transform) {
    for (const s of this.shapes) s.transform(t)
  }

  hitTest(p: Vec2, c: StrokeHitContext): boolean {
    const tol = c.tolerance + this.smooth.stroke_width * 0.5
    for (const s of this.shapes) if (s.hitTest(p, tol)) return true
    return false
  }

  intersectsAabb(box: Aabb): boolean {
    for (const s of this.shapes) {
      if (box.intersects(s.bounds())) return true
    }
    return false
  }

  intersectsEraser(center: Vec2, radius: number): boolean {
    const box = Aabb.fromHalfExtents(center, new Vec2(radius, radius))
    return this.intersectsAabb(box)
  }

  splitByEraser(center: Vec2, radius: number): ShapeStroke[] {
    // Shapes are erased as a whole when hit (rnote behaviour for shape strokes).
    return this.intersectsEraser(center, radius) ? [] : [this]
  }

  invertColors() {
    if (this.smooth.stroke_color) this.smooth.stroke_color = this.smooth.stroke_color.toInvertedBrightnessColor()
    if (this.smooth.fill_color) this.smooth.fill_color = this.smooth.fill_color.toInvertedBrightnessColor()
    if (this.rough.stroke_color) this.rough.stroke_color = this.rough.stroke_color.toInvertedBrightnessColor()
    if (this.rough.fill_color) this.rough.fill_color = this.rough.fill_color.toInvertedBrightnessColor()
  }

  duplicate(): Stroke {
    const copy = new ShapeStroke(this.shapes.map((s) => s.clone()), {
      smooth: this.smooth.clone(),
      rough: this.rough.clone(),
      roughEnabled: this.roughEnabled,
      highlightMode: this.highlightMode,
      highlightOpacity: this.highlightOpacity
    })
    copy.layer = this.layer
    return copy
  }

  toJSON(): StrokeJSON {
    return {
      id: this.id,
      kind: 'shape',
      shapes: this.shapes.map((s) => s.toJSON()),
      smooth: this.smooth.toJSON(),
      rough: this.rough.toJSON(),
      rough_enabled: this.roughEnabled,
      highlight_mode: this.highlightMode,
      highlight_opacity: this.highlightOpacity,
      layer: this.layer
    }
  }

  static fromJSON(o: any): ShapeStroke {
    const shapes = (o.shapes ?? []).map((s: any) => shapeFromJSON(s)).filter(Boolean) as Shape[]
    const stroke = new ShapeStroke(shapes, {
      smooth: SmoothOptions.fromJSON(o.smooth),
      rough: RoughOptions.fromJSON(o.rough),
      roughEnabled: o.rough_enabled ?? false,
      highlightMode: o.highlight_mode ?? false,
      highlightOpacity: o.highlight_opacity ?? 0.45,
      id: o.id
    })
    if (o.layer) stroke.layer = o.layer
    return stroke
  }
}

export { distPointSegment, pointInPolygon }
