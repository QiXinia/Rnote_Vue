// Port of rnote-compose shape builders. Drag builders (line/arrow/rectangle/
// ellipse/grid/coordinate systems) build on pointer drag; multi-click builders
// (polygon/polyline/quadratic & cubic bezier / foci ellipse) accumulate anchor
// points and confirm on the final click or double-click.

import { Vec2, Aabb, clamp } from '../geometry'
import {
  Shape,
  LineShape,
  ArrowShape,
  RectangleShape,
  EllipseShape,
  PolygonShape,
  QuadBezShape,
  CubBezShape,
  ArrowHeadStyle
} from './shape'
import { Constraints } from '../constraints'

export enum ShapeBuilderType {
  Line = 'line',
  Arrow = 'arrow',
  Rectangle = 'rectangle',
  Grid = 'grid',
  CoordSystem2D = 'coord_system_2d',
  CoordSystem3D = 'coord_system_3d',
  QuadrantCoordSystem2D = 'quadrant_coord_system_2d',
  Ellipse = 'ellipse',
  FociEllipse = 'foci_ellipse',
  QuadBez = 'quadbez',
  CubBez = 'cubbez',
  Polyline = 'polyline',
  Polygon = 'polygon'
}

export const DRAG_BUILDERS: Set<ShapeBuilderType> = new Set([
  ShapeBuilderType.Line,
  ShapeBuilderType.Arrow,
  ShapeBuilderType.Rectangle,
  ShapeBuilderType.Grid,
  ShapeBuilderType.CoordSystem2D,
  ShapeBuilderType.CoordSystem3D,
  ShapeBuilderType.QuadrantCoordSystem2D,
  ShapeBuilderType.Ellipse
])

export const BUILDER_LABELS: Record<ShapeBuilderType, string> = {
  [ShapeBuilderType.Line]: 'Line',
  [ShapeBuilderType.Arrow]: 'Arrow',
  [ShapeBuilderType.Rectangle]: 'Rectangle',
  [ShapeBuilderType.Grid]: 'Grid',
  [ShapeBuilderType.CoordSystem2D]: '2D Coordinate System',
  [ShapeBuilderType.CoordSystem3D]: '3D Coordinate System',
  [ShapeBuilderType.QuadrantCoordSystem2D]: 'Quadrant 2D Coordinate System',
  [ShapeBuilderType.Ellipse]: 'Ellipse',
  [ShapeBuilderType.FociEllipse]: 'Foci Ellipse',
  [ShapeBuilderType.QuadBez]: 'Quadratic Bezier',
  [ShapeBuilderType.CubBez]: 'Cubic Bezier',
  [ShapeBuilderType.Polyline]: 'Polyline',
  [ShapeBuilderType.Polygon]: 'Polygon'
}

export class ShapeBuilder {
  type: ShapeBuilderType
  constraints: Constraints
  anchors: Vec2[] = []
  current: Vec2 | null = null
  finished = false

  constructor(type: ShapeBuilderType, constraints: Constraints) {
    this.type = type
    this.constraints = constraints
  }

  get isDrag(): boolean {
    return DRAG_BUILDERS.has(this.type)
  }

  // number of anchors required for multi-click builders (Infinity = polygon-like)
  get requiredAnchors(): number {
    switch (this.type) {
      case ShapeBuilderType.QuadBez:
      case ShapeBuilderType.FociEllipse:
        return 3
      case ShapeBuilderType.CubBez:
        return 4
      default:
        return Infinity
    }
  }

  begin(pos: Vec2) {
    this.anchors = [pos.clone()]
    this.current = pos.clone()
  }

  update(pos: Vec2, shift = false) {
    let p = pos.clone()
    if (this.isDrag && this.anchors.length) {
      const start = this.anchors[0]
      if (this.type === ShapeBuilderType.Line || this.type === ShapeBuilderType.Arrow) {
        const d = this.constraints.constrainDirection(p.sub(start), shift)
        p = start.add(d)
      } else {
        p = this.constraints.constrainSize(start, p, shift)
      }
    }
    this.current = p
  }

  // returns true when the builder has collected enough anchors to finish
  addAnchor(pos: Vec2, shift = false): boolean {
    this.update(pos, shift)
    if (this.isDrag) return true
    this.anchors.push(this.current!.clone())
    if (this.anchors.length >= this.requiredAnchors) {
      this.finished = true
      return true
    }
    return false
  }

  doubleClick(pos: Vec2): boolean {
    if (this.type === ShapeBuilderType.Polygon || this.type === ShapeBuilderType.Polyline) {
      if (this.anchors.length >= (this.type === ShapeBuilderType.Polygon ? 3 : 2)) {
        this.finished = true
        return true
      }
    }
    return false
  }

  // Live preview shapes while drawing.
  preview(): Shape[] {
    if (!this.anchors.length) return []
    const cur = this.current ?? this.anchors[0]
    switch (this.type) {
      case ShapeBuilderType.Line:
        return [new LineShape(this.anchors[0], cur)]
      case ShapeBuilderType.Arrow: {
        const a = new ArrowShape(this.anchors[0], cur)
        a.head = ArrowHeadStyle.Triangle
        return [a]
      }
      case ShapeBuilderType.Rectangle:
        return [new RectangleShape(Aabb.new(this.anchors[0], cur))]
      case ShapeBuilderType.Ellipse:
        return [EllipseShape.fromRect(Aabb.new(this.anchors[0], cur))]
      case ShapeBuilderType.Grid:
        return buildGrid(this.anchors[0], cur)
      case ShapeBuilderType.CoordSystem2D:
        return buildCoord2D(this.anchors[0], cur, false)
      case ShapeBuilderType.QuadrantCoordSystem2D:
        return buildCoord2D(this.anchors[0], cur, true)
      case ShapeBuilderType.CoordSystem3D:
        return buildCoord3D(this.anchors[0], cur)
      case ShapeBuilderType.QuadBez:
        return this.multiPreview((a) => [new QuadBezShape(a[0], a[1] ?? cur, a[2] ?? cur)])
      case ShapeBuilderType.CubBez:
        return this.multiPreview((a) => [new CubBezShape(a[0], a[1] ?? cur, a[2] ?? cur, a[3] ?? cur)])
      case ShapeBuilderType.FociEllipse:
        return this.multiPreview((a) => [buildFociEllipse(a[0], a[1] ?? cur, a[2] ?? cur)])
      case ShapeBuilderType.Polyline:
        return this.multiPreview((a) => [new PolygonShape([...a, cur], false)])
      case ShapeBuilderType.Polygon:
        return this.multiPreview((a) => [new PolygonShape([...a, cur], a.length >= 2)])
      default:
        return []
    }
  }

  private multiPreview(make: (anchors: Vec2[]) => Shape[]): Shape[] {
    return make(this.anchors)
  }

  // Final committed shapes.
  build(): Shape[] {
    if (this.isDrag) {
      return this.preview()
    }
    if (this.type === ShapeBuilderType.Polygon || this.type === ShapeBuilderType.Polyline) {
      const closed = this.type === ShapeBuilderType.Polygon
      if (this.anchors.length < (closed ? 3 : 2)) return []
      return [new PolygonShape(this.anchors.map((a) => a.clone()), closed)]
    }
    if (!this.finished) return []
    return this.preview()
  }
}

function tickSpacing(len: number): number {
  const target = 8
  const raw = len / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  let step
  if (norm < 1.5) step = 1
  else if (norm < 3.5) step = 2
  else if (norm < 7.5) step = 5
  else step = 10
  return step * mag
}

function axisWithTicks(origin: Vec2, end: Vec2, tickLen: number, bothDirections: boolean): Shape[] {
  const shapes: Shape[] = []
  const arrow = new ArrowShape(origin, end)
  arrow.head = ArrowHeadStyle.Triangle
  shapes.push(arrow)
  if (bothDirections) {
    const back = new ArrowShape(origin, origin.mul(2).sub(end))
    back.head = ArrowHeadStyle.Triangle
    shapes.push(back)
  }
  const dir = end.sub(origin)
  const len = dir.length()
  if (len < 10) return shapes
  const unit = dir.normalize()
  const perp = unit.perp()
  const spacing = tickSpacing(len)
  const n = Math.floor(len / spacing)
  for (let i = 1; i <= n; i++) {
    const center = origin.add(unit.mul(i * spacing))
    shapes.push(new LineShape(center.sub(perp.mul(tickLen * 0.5)), center.add(perp.mul(tickLen * 0.5))))
    if (bothDirections) {
      const center2 = origin.sub(unit.mul(i * spacing))
      shapes.push(new LineShape(center2.sub(perp.mul(tickLen * 0.5)), center2.add(perp.mul(tickLen * 0.5))))
    }
  }
  return shapes
}

function buildGrid(a: Vec2, b: Vec2): Shape[] {
  const rect = Aabb.new(a, b)
  const shapes: Shape[] = [new RectangleShape(rect)]
  const w = rect.width()
  const h = rect.height()
  if (w < 8 || h < 8) return shapes
  const cell = tickSpacing(Math.min(w, h))
  for (let x = rect.min.x + cell; x < rect.max.x - 1; x += cell) {
    shapes.push(new LineShape(new Vec2(x, rect.min.y), new Vec2(x, rect.max.y)))
  }
  for (let y = rect.min.y + cell; y < rect.max.y - 1; y += cell) {
    shapes.push(new LineShape(new Vec2(rect.min.x, y), new Vec2(rect.max.x, y)))
  }
  return shapes
}

function buildCoord2D(origin: Vec2, corner: Vec2, quadrant: boolean): Shape[] {
  const dx = corner.x - origin.x
  const dy = corner.y - origin.y
  const shapes: Shape[] = []
  // x axis (horizontal)
  const xEnd = new Vec2(origin.x + Math.abs(dx) + 30, origin.y)
  const yEnd = new Vec2(origin.x, origin.y - Math.abs(dy) - 30)
  shapes.push(...axisWithTicks(origin, xEnd, 12, !quadrant))
  shapes.push(...axisWithTicks(origin, yEnd, 12, !quadrant))
  return shapes
}

function buildCoord3D(origin: Vec2, corner: Vec2): Shape[] {
  const size = Math.max(origin.distance(corner), 60)
  const shapes: Shape[] = []
  const xEnd = origin.add(new Vec2(size + 30, 0))
  const yEnd = origin.add(new Vec2(-size * 0.5 - 20, -size * 0.5 - 20))
  const zEnd = origin.add(new Vec2(0, size * 0.7 + 20))
  shapes.push(...axisWithTicks(origin, xEnd, 10, false))
  shapes.push(...axisWithTicks(origin, yEnd, 10, false))
  shapes.push(...axisWithTicks(origin, zEnd, 10, false))
  return shapes
}

function buildFociEllipse(f1: Vec2, f2: Vec2, edge: Vec2): EllipseShape {
  // Ellipse = locus where dist(p,f1)+dist(p,f2) = 2a
  const twoA = edge.distance(f1) + edge.distance(f2)
  const a = twoA / 2
  const c = f1.distance(f2) / 2
    const center = f1.lerp(f2, 0.5)
  const b = Math.sqrt(Math.max(a * a - c * c, 1))
  const rotation = Math.atan2(f2.y - f1.y, f2.x - f1.x)
  return new EllipseShape(center, new Vec2(a, b), rotation)
}

export { clamp }
