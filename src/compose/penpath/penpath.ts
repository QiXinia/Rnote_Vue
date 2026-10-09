// Port of rnote-compose penpath: Element, Segment, PenPath and the path
// builders (simple / curved / modeled).
//
// Desktop Rnote fits the captured input elements, when a stroke finishes, into
// Catmull-Rom cubic-bezier segments and stores those segments as the
// authoritative, resolution-independent path (the basis of lossless zoom and
// vector PDF/SVG export). This port does the same: PenPath holds the fitted
// `start` + `segments`; `elements` is kept as a dense derived polyline used by
// hit-testing and the eraser. While a stroke is still being drawn only the raw
// elements exist and the live renderer interpolates them with Catmull-Rom.

import { Vec2, catmullRom, clamp, lerp } from '../geometry'
import { Aabb } from '../geometry/aabb'

export class Element {
  pos: Vec2
  pressure: number

  constructor(pos: Vec2, pressure = 0.5) {
    this.pos = pos
    this.pressure = pressure
  }

  clone(): Element {
    return new Element(this.pos.clone(), this.pressure)
  }

  toJSON() {
    return { pos: { x: round3(this.pos.x), y: round3(this.pos.y) }, pressure: round3(this.pressure) }
  }
  static fromJSON(o: any): Element {
    return new Element(new Vec2(o.pos.x, o.pos.y), o.pressure ?? 0.5)
  }
}

export enum SegmentType {
  LineTo = 'line_to',
  QuadBezTo = 'quad_bez_to',
  CubBezTo = 'cub_bez_to'
}

function vec3(v: Vec2) {
  return { x: round3(v.x), y: round3(v.y) }
}

// A single pen-path segment. Mirrors rnote-compose penpath::Segment:
//   lineto    { end: Element }
//   quadbezto { cp: Vec2, end: Element }
//   cubbezto  { cp1: Vec2, cp2: Vec2, end: Element }
export class Segment {
  type: SegmentType
  cp: Vec2[]
  end: Element

  constructor(type: SegmentType, end: Element, cp: Vec2[] = []) {
    this.type = type
    this.end = end
    this.cp = cp
  }

  clone(): Segment {
    return new Segment(this.type, this.end.clone(), this.cp.map((c) => c.clone()))
  }

  toJSON(): any {
    if (this.type === SegmentType.LineTo) {
      return { lineto: { end: this.end.toJSON() } }
    }
    if (this.type === SegmentType.QuadBezTo) {
      return { quadbezto: { cp: vec3(this.cp[0]), end: this.end.toJSON() } }
    }
    return {
      cubbezto: { cp1: vec3(this.cp[0]), cp2: vec3(this.cp[1]), end: this.end.toJSON() }
    }
  }

  static fromJSON(o: any): Segment | null {
    const line = o.lineto ?? o.line
    if (line) return new Segment(SegmentType.LineTo, Element.fromJSON(line.end))
    const quad = o.quadbezto ?? o.quadbez
    if (quad) {
      return new Segment(SegmentType.QuadBezTo, Element.fromJSON(quad.end), [
        new Vec2(quad.cp.x, quad.cp.y)
      ])
    }
    const cub = o.cubbezto ?? o.cubbez
    if (cub) {
      return new Segment(SegmentType.CubBezTo, Element.fromJSON(cub.end), [
        new Vec2(cub.cp1.x, cub.cp1.y),
        new Vec2(cub.cp2.x, cub.cp2.y)
      ])
    }
    return null
  }
}

export enum PenPathBuilderType {
  Simple = 'simple',
  Curved = 'curved',
  Modeled = 'modeled'
}

// Minimum distance (px) between captured input elements.
export const INPUT_ELEMENT_MIN_DISTANCE = 1.5

export interface RenderLine {
  start: Vec2
  end: Vec2
}
export interface SampleGroup {
  lines: RenderLine[]
  sp: number
  ep: number
}

// Evaluate a cubic bezier (p0 -> p1 with controls c1,c2) at t.
function cubicPoint(p0: Vec2, c1: Vec2, c2: Vec2, p1: Vec2, t: number): Vec2 {
  const u = 1 - t
  const tt = t * t
  const uu = u * u
  const a = uu * u
  const b = 3 * uu * t
  const c = 3 * u * tt
  const d = tt * t
  return new Vec2(
    a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    a * p0.y + b * c1.y + c * c2.y + d * p1.y
  )
}

// Catmull-Rom (tension = 1) to cubic bezier. Port of
// CubicBezier::new_w_catmull_rom(first, second, third, forth):
//   start = second
//   cp1   = second + (third - first) / 6
//   cp2   = third  - (forth - second) / 6
//   end   = third
function catmullCubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): Segment | null {
  if (p2.distance(p1) === 0) return new Segment(SegmentType.LineTo, new Element(p2.clone(), 0.5))
  const cp1 = p1.add(p2.sub(p0).div(6))
  const cp2 = p2.sub(p3.sub(p1).div(6))
  return new Segment(SegmentType.CubBezTo, new Element(p2.clone(), 0.5), [cp1, cp2])
}

// Fit captured elements into cubic-bezier segments (curved builder).
//
// The spline passes through every captured point (including the pen-up point,
// which keeps a fast flick intact); the boundaries clamp the missing
// predecessor/successor to the endpoints, so the pen joins/leaves smoothly
// rather than with a straight chord. Internally the control points use the
// exact desktop Catmull-Rom formula.
function fitCurved(els: Element[]): Segment[] {
  const n = els.length
  if (n < 1) return []
  if (n === 1) return [new Segment(SegmentType.LineTo, els[0].clone())]

  const segs: Segment[] = []
  for (let k = 0; k <= n - 2; k++) {
    // Segment end = e[k+1]; clamp the virtual neighbour at the boundaries.
    const p0 = k === 0 ? els[0].pos : els[k - 1].pos
    const p1 = els[k].pos
    const p2 = els[k + 1].pos
    const p3 = els[Math.min(n - 1, k + 2)].pos
    const seg = catmullCubic(p0, p1, p2, p3)!
    // carry the captured element (pressure) at the segment end
    seg.end = els[k + 1].clone()
    segs.push(seg)
  }
  return segs
}

export class PenPath {
  elements: Element[] = []
  segments: Segment[] = []
  startEl: Element | null = null
  fitted = false
  builderType: PenPathBuilderType = PenPathBuilderType.Curved

  constructor(elements: Element[] = [], builderType: PenPathBuilderType = PenPathBuilderType.Curved) {
    this.elements = elements
    this.builderType = builderType
  }

  clone(): PenPath {
    const p = new PenPath(
      this.elements.map((e) => e.clone()),
      this.builderType
    )
    if (this.fitted) {
      p.fitted = true
      p.startEl = this.startEl ? this.startEl.clone() : null
      p.segments = this.segments.map((s) => s.clone())
    }
    return p
  }

  get start(): Vec2 | null {
    if (this.fitted) return this.startEl ? this.startEl.pos : null
    return this.elements.length ? this.elements[0].pos : null
  }
  get end(): Vec2 | null {
    if (this.fitted) {
      const last = this.segments[this.segments.length - 1]
      return last ? last.end.pos : this.startEl ? this.startEl.pos : null
    }
    const n = this.elements.length
    return n ? this.elements[n - 1].pos : null
  }

  addElement(el: Element) {
    const last = this.elements[this.elements.length - 1]
    if (last && last.pos.distance(el.pos) < INPUT_ELEMENT_MIN_DISTANCE) {
      // update pressure of the last point for richer mouse input
      last.pressure = Math.max(last.pressure, el.pressure)
      return
    }
    this.elements.push(el)
  }

  // Fit the captured elements into the authoritative bezier segments when the
  // stroke is completed. After fitting, elements is a dense derived polyline.
  fit(builderType: PenPathBuilderType = this.builderType, spacing = 2.0) {
    let els = this.elements
    if (els.length === 0) return
    if (builderType === PenPathBuilderType.Modeled) els = PenPath.modeledFrom(els)
    this.builderType = builderType
    this.startEl = els[0].clone()
    this.segments =
      builderType === PenPathBuilderType.Simple
        ? els.slice(1).map((e) => new Segment(SegmentType.LineTo, e.clone()))
        : fitCurved(els)
    this.fitted = true
    this.elements = PenPath.sampleToElements(this.startEl, this.segments, spacing)
  }

  // Build a PenPath directly from native (desktop) start + segments.
  static fromNative(
    start: Element,
    segments: Segment[],
    builderType: PenPathBuilderType = PenPathBuilderType.Curved,
    spacing = 2.0
  ): PenPath {
    const p = new PenPath([], builderType)
    p.startEl = start.clone()
    p.segments = segments
    p.fitted = true
    p.elements = PenPath.sampleToElements(start, segments, spacing)
    return p
  }

  // Dense elements (positions + pressure) sampled along the fitted segments.
  static sampleToElements(start: Element, segs: Segment[], spacing: number): Element[] {
    const out: Element[] = [start.clone()]
    let cur = start
    for (const seg of segs) {
      const end = seg.end
      if (seg.type === SegmentType.LineTo) {
        const len = cur.pos.distance(end.pos)
        const steps = Math.max(1, Math.ceil(len / spacing))
        for (let s = 1; s <= steps; s++) {
          const t = s / steps
          out.push(new Element(cur.pos.lerp(end.pos, t), lerp(cur.pressure, end.pressure, t)))
        }
      } else if (seg.type === SegmentType.CubBezTo) {
        const cp1 = seg.cp[0]
        const cp2 = seg.cp[1]
        const len = cur.pos.distance(cp1) + cp1.distance(cp2) + cp2.distance(end.pos)
        const steps = Math.max(1, Math.ceil(len / spacing))
        for (let s = 1; s <= steps; s++) {
          const t = s / steps
          out.push(
            new Element(cubicPoint(cur.pos, cp1, cp2, end.pos, t), lerp(cur.pressure, end.pressure, t))
          )
        }
      } else if (seg.type === SegmentType.QuadBezTo) {
        const cp = seg.cp[0]
        const len = cur.pos.distance(cp) + cp.distance(end.pos)
        const steps = Math.max(1, Math.ceil(len / spacing))
        for (let s = 1; s <= steps; s++) {
          const t = s / steps
          const q0 = cur.pos.lerp(cp, t)
          const q1 = cp.lerp(end.pos, t)
          out.push(new Element(q0.lerp(q1, t), lerp(cur.pressure, end.pressure, t)))
        }
      }
      cur = end
    }
    return out
  }

  // If the whole path collapses to one point (a tap), return that element.
  dotCenter(): Element | null {
    if (!this.fitted) {
      if (this.elements.length === 0) return null
      const p = this.elements[0].pos
      return this.elements.every((e) => e.pos.equals(p)) ? this.elements[0] : null
    }
    if (!this.startEl) return null
    const p = this.startEl.pos
    for (const s of this.segments) if (!s.end.pos.equals(p)) return null
    return this.startEl
  }

  // Groups of dense render lines used to build the variable-width outline.
  // Fitted paths sample the stored bezier segments (lossless); a live stroke
  // interpolates its raw elements with Catmull-Rom.
  sampleGroups(targetSpacing = 2.0): SampleGroup[] {
    if (this.fitted) {
      const groups: SampleGroup[] = []
      let curPos = this.startEl!.pos
      let curP = this.startEl!.pressure
      for (const seg of this.segments) {
        const end = seg.end
        if (seg.type === SegmentType.LineTo) {
          groups.push({
            lines: [{ start: curPos.clone(), end: end.pos.clone() }],
            sp: curP,
            ep: end.pressure
          })
        } else if (seg.type === SegmentType.CubBezTo) {
          const cp1 = seg.cp[0]
          const cp2 = seg.cp[1]
          const len = curPos.distance(cp1) + cp1.distance(cp2) + cp2.distance(end.pos)
          const steps = Math.max(1, Math.ceil(len / targetSpacing))
          const pts: Vec2[] = [curPos.clone()]
          for (let s = 1; s <= steps; s++) {
            pts.push(cubicPoint(curPos, cp1, cp2, end.pos, s / steps))
          }
          const lines: RenderLine[] = pts.slice(0, -1).map((a, j) => ({ start: a, end: pts[j + 1] }))
          groups.push({ lines, sp: curP, ep: end.pressure })
        } else {
          const cp = seg.cp[0]
          const len = curPos.distance(cp) + cp.distance(end.pos)
          const steps = Math.max(1, Math.ceil(len / targetSpacing))
          const pts: Vec2[] = [curPos.clone()]
          for (let s = 1; s <= steps; s++) {
            const t = s / steps
            pts.push(curPos.lerp(cp, t).lerp(cp.lerp(end.pos, t), t))
          }
          const lines: RenderLine[] = pts.slice(0, -1).map((a, j) => ({ start: a, end: pts[j + 1] }))
          groups.push({ lines, sp: curP, ep: end.pressure })
        }
        curPos = end.pos
        curP = end.pressure
      }
      return groups
    }

    // Live (unfitted) stroke: per-interval Catmull-Rom interpolation.
    const groups: SampleGroup[] = []
    for (let i = 0; i < this.elements.length - 1; i++) {
      const center = this.segmentCenterline(i, targetSpacing)
      const lines: RenderLine[] = center.slice(0, -1).map((a, j) => ({ start: a, end: center[j + 1] }))
      groups.push({ lines, sp: this.elements[i].pressure, ep: this.elements[i + 1].pressure })
    }
    return groups
  }

  bounds(): Aabb {
    if (this.elements.length === 0) return new Aabb()
    if (this.elements.length === 1) {
      const p = this.elements[0].pos
      return Aabb.new(p, p)
    }
    return Aabb.fromPoints(this.elements.map((e) => e.pos))
  }

  hitbox(width: number): Aabb {
    return this.bounds().extend_by(width * 0.5 + 8)
  }

  // ---- centerline generation -------------------------------------------------

  // Modeled builder pre-smooths input positions with a moving average, which
  // removes the jitter of hand-drawn strokes more aggressively.
  static modeledFrom(els: Element[]): Element[] {
    if (els.length < 3) return els.map((e) => e.clone())
    const out: Element[] = []
    const window = 3
    for (let i = 0; i < els.length; i++) {
      let sx = 0
      let sy = 0
      let sp = 0
      let count = 0
      for (let k = i - Math.floor(window / 2); k <= i + Math.floor(window / 2); k++) {
        if (k >= 0 && k < els.length) {
          sx += els[k].pos.x
          sy += els[k].pos.y
          sp += els[k].pressure
          count++
        }
      }
      out.push(new Element(new Vec2(sx / count, sy / count), sp / count))
    }
    // preserve endpoints
    out[0] = els[0].clone()
    out[out.length - 1] = els[els.length - 1].clone()
    return out
  }

  private modeledElements(): Element[] {
    return PenPath.modeledFrom(this.elements)
  }

  // Returns the centerline for one raw input interval. This mirrors the desktop
  // renderer's per-segment outline construction, including the curved builder's
  // Catmull-Rom interpolation and the modeled builder's pre-smoothing.
  segmentCenterline(index: number, targetSpacing = 2.0): Vec2[] {
    let els = this.elements
    if (this.builderType === PenPathBuilderType.Modeled) els = this.modeledElements()
    const a = els[index]
    const b = els[index + 1]
    if (!a || !b) return []
    if (this.builderType === PenPathBuilderType.Simple) return [a.pos.clone(), b.pos.clone()]

    const p0 = els[Math.max(0, index - 1)].pos
    const p1 = a.pos
    const p2 = b.pos
    const p3 = els[Math.min(els.length - 1, index + 2)].pos
    const segLen = p1.distance(p2)
    const steps = Math.max(1, Math.ceil(segLen / targetSpacing))
    const out: Vec2[] = []
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      out.push(new Vec2(catmullRom(p0.x, p1.x, p2.x, p3.x, t), catmullRom(p0.y, p1.y, p2.y, p3.y, t)))
    }
    out.push(p2.clone())
    return out
  }

  // Returns a dense polyline (positions + per-sample pressure) describing the
  // stroke centerline, ready for variable-width outlining.
  resample(targetSpacing = 2.0): { points: Vec2[]; pressures: number[] } {
    let els = this.elements
    if (els.length === 0) return { points: [], pressures: [] }
    if (this.builderType === PenPathBuilderType.Modeled) els = this.modeledElements()

    if (els.length === 1 || this.builderType === PenPathBuilderType.Simple) {
      return this.resamplePolyline(els, targetSpacing)
    }
    return this.resampleCatmull(els, targetSpacing)
  }

  private resamplePolyline(els: Element[], spacing: number) {
    if (els.length === 1) {
      return { points: [els[0].pos.clone()], pressures: [els[0].pressure] }
    }
    const points: Vec2[] = [els[0].pos.clone()]
    const pressures: number[] = [els[0].pressure]
    for (let i = 1; i < els.length; i++) {
      const a = els[i - 1].pos
      const b = els[i].pos
      const segLen = a.distance(b)
      const steps = Math.max(1, Math.ceil(segLen / spacing))
      for (let s = 1; s <= steps; s++) {
        const t = s / steps
        points.push(a.lerp(b, t))
        pressures.push(lerpVal(els[i - 1].pressure, els[i].pressure, t))
      }
    }
    return { points, pressures }
  }

  private resampleCatmull(els: Element[], spacing: number) {
    const points: Vec2[] = []
    const pressures: number[] = []
    const n = els.length
    for (let i = 0; i < n - 1; i++) {
      const p0 = els[Math.max(0, i - 1)].pos
      const p1 = els[i].pos
      const p2 = els[Math.min(n - 1, i + 1)].pos
      const p3 = els[Math.min(n - 1, i + 2)].pos
      const segLen = p1.distance(p2)
      const steps = Math.max(1, Math.ceil(segLen / spacing))
      for (let s = 0; s < steps; s++) {
        const t = s / steps
        points.push(
          new Vec2(
            catmullRom(p0.x, p1.x, p2.x, p3.x, t),
            catmullRom(p0.y, p1.y, p2.y, p3.y, t)
          )
        )
        pressures.push(lerpVal(els[i].pressure, els[i + 1].pressure, t))
      }
    }
    points.push(els[n - 1].pos.clone())
    pressures.push(els[n - 1].pressure)
    return { points, pressures }
  }

  // Raw polyline (no resampling) used for hit-testing / eraser splitting.
  rawPoints(): Vec2[] {
    return this.elements.map((e) => e.pos)
  }

  // Total arc length.
  length(): number {
    let l = 0
    for (let i = 1; i < this.elements.length; i++) {
      l += this.elements[i - 1].pos.distance(this.elements[i].pos)
    }
    return l
  }

  translate(delta: Vec2) {
    for (const e of this.elements) e.pos = e.pos.add(delta)
    if (this.startEl) this.startEl.pos = this.startEl.pos.add(delta)
    for (const s of this.segments) {
      s.end.pos = s.end.pos.add(delta)
      for (const c of s.cp) {
        const nc = c.add(delta)
        c.x = nc.x
        c.y = nc.y
      }
    }
  }

  transform(t: { transformPoint: (p: Vec2) => Vec2 }) {
    for (const e of this.elements) e.pos = t.transformPoint(e.pos)
    if (this.startEl) this.startEl.pos = t.transformPoint(this.startEl.pos)
    for (const s of this.segments) {
      s.end.pos = t.transformPoint(s.end.pos)
      for (const c of s.cp) {
        const nc = t.transformPoint(c)
        c.x = nc.x
        c.y = nc.y
      }
    }
  }

  // Split the path at the parameter nearest to a given position, returning
  // two new PenPaths (used by the "split colliding strokes" eraser).
  splitAtNearest(point: Vec2, maxDist: number): [PenPath, PenPath] | null {
    let best = -1
    let bestD = maxDist
    for (let i = 0; i < this.elements.length; i++) {
      const d = this.elements[i].pos.distance(point)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    if (best < 1 || best > this.elements.length - 2) return null
    const left = new PenPath(
      this.elements.slice(0, best).map((e) => e.clone()),
      this.builderType
    )
    const right = new PenPath(
      this.elements.slice(best).map((e) => e.clone()),
      this.builderType
    )
    return [left, right]
  }

  intersectsAabb(box: Aabb): boolean {
    for (const e of this.elements) if (box.contains(e.pos)) return true
    for (let i = 1; i < this.elements.length; i++) {
      if (segmentIntersectsAabb(this.elements[i - 1].pos, this.elements[i].pos, box)) return true
    }
    return false
  }

  toJSON() {
    const o: any = {
      builder_type: this.builderType,
      elements: this.elements.map((e) => e.toJSON())
    }
    if (this.fitted && this.startEl) {
      o.start = this.startEl.toJSON()
      o.segments = this.segments.map((s) => s.toJSON())
    }
    return o
  }

  static fromJSON(o: any): PenPath {
    if (o && o.start && Array.isArray(o.segments)) {
      const segs: Segment[] = o.segments
        .map((s: any) => Segment.fromJSON(s))
        .filter((s: Segment | null): s is Segment => s !== null)
      return PenPath.fromNative(Element.fromJSON(o.start), segs, o.builder_type ?? PenPathBuilderType.Curved)
    }
    const p = new PenPath()
    p.builderType = o.builder_type ?? PenPathBuilderType.Curved
    p.elements = (o.elements ?? []).map((e: any) => Element.fromJSON(e))
    return p
  }
}

export function lerpVal(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}

// Builds the variable-width outline polygon (left + right offset polylines)
// for a dense centerline. Returns a closed polygon as a point list.
export function buildVariableWidthOutline(
  points: Vec2[],
  widths: number[],
  opts: { roundCap?: boolean } = {}
): Vec2[] {
  const n = points.length
  if (n === 0) return []
  if (n === 1) {
    const r = widths[0] * 0.5
    return circlePolygon(points[0], Math.max(r, 0.6), 10)
  }

  const half = widths.map((w) => Math.max(w * 0.5, 0.15))
  const left: Vec2[] = []
  const right: Vec2[] = []

  for (let i = 0; i < n; i++) {
    let normal: Vec2
    if (i === 0) {
      normal = points[1].sub(points[0])
    } else if (i === n - 1) {
      normal = points[n - 1].sub(points[n - 2])
    } else {
      normal = points[i + 1].sub(points[i - 1])
    }
    const nn = normal.normalize()
    const perp = new Vec2(-nn.y, nn.x)
    // miter-ish offset; clamp to avoid spikes at sharp corners
    let prevPerp = perp
    if (i > 0) {
      const d = points[i].sub(points[i - 1]).normalize()
      prevPerp = new Vec2(-d.y, d.x)
    }
    let offset = perp
    const dot = Math.abs(perp.dot(prevPerp))
    if (dot < 0.4) offset = perp.add(prevPerp).normalize()
    left.push(points[i].add(offset.mul(half[i])))
    right.push(points[i].sub(offset.mul(half[i])))
  }

  const roundCap = opts.roundCap !== false
  if (roundCap) {
    // round start cap
    const startPoly = arcPoints(points[0], half[0], right[0], left[0], true)
    const endPoly = arcPoints(points[n - 1], half[n - 1], left[n - 1], right[n - 1], true)
    return [...startPoly, ...left, ...endPoly, ...[...right].reverse()]
  }
  return [...left, ...[...right].reverse()]
}

function arcPoints(center: Vec2, radius: number, from: Vec2, to: Vec2, _leftSide: boolean): Vec2[] {
  const a0 = Math.atan2(from.y - center.y, from.x - center.x)
  const a1 = Math.atan2(to.y - center.y, to.x - center.x)
  let delta = a1 - a0
  while (delta < 0) delta += Math.PI * 2
  const steps = Math.max(4, Math.ceil(delta / (Math.PI / 8)))
  const out: Vec2[] = []
  for (let i = 1; i < steps; i++) {
    const a = a0 + (delta * i) / steps
    out.push(new Vec2(center.x + Math.cos(a) * radius, center.y + Math.sin(a) * radius))
  }
  return out
}

function circlePolygon(center: Vec2, radius: number, steps: number): Vec2[] {
  const out: Vec2[] = []
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    out.push(new Vec2(center.x + Math.cos(a) * radius, center.y + Math.sin(a) * radius))
  }
  return out
}

function segmentIntersectsAabb(a: Vec2, b: Vec2, box: Aabb): boolean {
  if (box.contains(a) || box.contains(b)) return true
  // Liang-Barsky
  const dx = b.x - a.x
  const dy = b.y - a.y
  let t0 = 0
  let t1 = 1
  const p = [-dx, dx, -dy, dy]
  const q = [a.x - box.min.x, box.max.x - a.x, a.y - box.min.y, box.max.y - a.y]
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false
    } else {
      const r = q[i] / p[i]
      if (p[i] < 0) {
        if (r > t1) return false
        if (r > t0) t0 = r
      } else {
        if (r < t0) return false
        if (r < t1) t1 = r
      }
    }
  }
  return true
}

export { clamp }
