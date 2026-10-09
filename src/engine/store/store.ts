// Port of rnote-engine store/StrokeStore: owns all strokes, the current
// selection, groups and spatial queries / rendering order.

import { Vec2, Aabb, Transform } from '../../compose/geometry'
import { StrokeLayer, strokeLayerRank } from '../../compose/style/options'
import type { Stroke } from '../strokes/stroke'
import { strokeBounds } from '../strokes/stroke'
import { nextStrokeId, seedStrokeIds } from '../strokes/next-id'

export interface StoreSnapshot {
  strokes: any[]
  selected: number[]
  groups: Record<string, number[]>
}

export class StrokeStore {
  strokes = new Map<number, Stroke>()
  selected = new Set<number>()
  groups = new Map<string, number[]>()
  private groupCounter = 0
  version = 0
  private orderedCache: Stroke[] | null = null

  bump() {
    this.version++
    this.orderedCache = null
  }

  clear() {
    this.strokes.clear()
    this.selected.clear()
    this.groups.clear()
    this.bump()
  }

  addStroke(stroke: Stroke, select = false): number {
    this.strokes.set(stroke.id, stroke)
    if (select) {
      this.selected.clear()
      this.selected.add(stroke.id)
    }
    this.bump()
    return stroke.id
  }

  addStrokes(strokes: Stroke[]) {
    for (const s of strokes) this.strokes.set(s.id, s)
    this.bump()
  }

  remove(id: number) {
    this.strokes.delete(id)
    this.selected.delete(id)
    this.bump()
  }

  removeStrokes(ids: Iterable<number>) {
    for (const id of ids) {
      this.strokes.delete(id)
      this.selected.delete(id)
    }
    this.bump()
  }

  get(id: number): Stroke | undefined {
    return this.strokes.get(id)
  }

  // Rendering order follows rnote's ChronoComponent layers. Within a layer,
  // insertion/id order is used; imported desktop files are pre-sorted by time.
  ordered(): Stroke[] {
    // Length check guards against a stale empty-array cache (an empty array is
    // truthy) if a fill path ever bumps out of order.
    if (this.orderedCache && this.orderedCache.length === this.strokes.size) return this.orderedCache
    const all = [...this.strokes.values()]
    all.sort((a, b) => {
      const la = strokeLayerRank(a.layer)
      const lb = strokeLayerRank(b.layer)
      if (la !== lb) return la - lb
      return a.id - b.id
    })
    this.orderedCache = all
    return all
  }

  all(): Stroke[] {
    return [...this.strokes.values()]
  }

  count(): number {
    return this.strokes.size
  }

  boundsAll(): Aabb | null {
    return strokeBounds(this.all())
  }
  boundsSelected(): Aabb | null {
    return strokeBounds(this.selectedStrokes())
  }

  selectedStrokes(): Stroke[] {
    return [...this.selected].map((id) => this.strokes.get(id)!).filter(Boolean)
  }

  // ---- selection ----
  setSelection(ids: number[]) {
    this.selected = new Set(ids)
    this.bump()
  }
  select(id: number, additive = false) {
    if (!additive) this.selected.clear()
    this.selected.add(id)
    this.bump()
  }
  toggleSelected(id: number) {
    if (this.selected.has(id)) this.selected.delete(id)
    else this.selected.add(id)
    this.bump()
  }
  deselect(id: number) {
    this.selected.delete(id)
    this.bump()
  }
  deselectAll() {
    this.selected.clear()
    this.bump()
  }
  selectAll() {
    this.selected = new Set(this.strokes.keys())
    this.bump()
  }
  isSelected(id: number): boolean {
    return this.selected.has(id)
  }

  // ---- spatial queries ----
  hitTestPoint(p: Vec2, tolerance: number, zoom: number, topOnly = true): number[] {
    const hits: number[] = []
    const ordered = this.ordered()
    for (let i = ordered.length - 1; i >= 0; i--) {
      const s = ordered[i]
      if (s.hitTest(p, { tolerance, zoom })) {
        hits.push(s.id)
        if (topOnly) return hits
      }
    }
    return hits
  }

  hitTestAabb(box: Aabb, fullyContained = false): number[] {
    const hits: number[] = []
    // Use the cached whole-stroke bounds (a cheap AABB test) instead of the
    // per-segment intersectsAabb; marquee selection in Rnote is bounds-based.
    for (const s of this.all()) {
      const b = s.bounds()
      if (fullyContained) {
        if (box.includes(b)) hits.push(s.id)
      } else if (box.intersects(b)) {
        hits.push(s.id)
      }
    }
    return hits
  }

  hitTestPolygon(polygon: Vec2[]): number[] {
    const box = Aabb.fromPoints(polygon)
    const hits: number[] = []
    for (const s of this.all()) {
      const b = s.bounds()
      if (!box.intersects(b)) continue
      // sample stroke bounds corners + center for containment/intersection
      const samples = [b.center(), b.min, b.max, new Vec2(b.min.x, b.max.y), new Vec2(b.max.x, b.min.y)]
      if (samples.some((p) => pointInPolygon(p, polygon))) hits.push(s.id)
      else if (polylineIntersectsPolygon(s, polygon)) hits.push(s.id)
    }
    return hits
  }

  hitTestPath(points: Vec2[], tolerance: number, zoom: number): number[] {
    const hits = new Set<number>()
    for (const p of points) {
      for (const id of this.hitTestPoint(p, tolerance, zoom, false)) hits.add(id)
    }
    return [...hits]
  }

  translateStrokes(ids: Iterable<number>, delta: Vec2) {
    for (const id of ids) this.strokes.get(id)?.translate(delta)
    this.bump()
  }

  transformStrokes(ids: Iterable<number>, t: Transform) {
    for (const id of ids) this.strokes.get(id)?.transform(t)
    this.bump()
  }

  duplicateStrokes(ids: number[], offset = new Vec2(20, 20)): Stroke[] {
    const copies: Stroke[] = []
    for (const id of ids) {
      const s = this.strokes.get(id)
      if (s) {
        const d = s.duplicate()
        d.translate(offset)
        copies.push(d)
      }
    }
    this.addStrokes(copies)
    return copies
  }

  // ---- groups ----
  groupSelected(): string | null {
    const ids = [...this.selected]
    if (ids.length < 2) return null
    const key = `group-${++this.groupCounter}`
    this.groups.set(key, ids)
    return key
  }
  ungroupSelected() {
    for (const [key, ids] of [...this.groups]) {
      if (ids.some((id) => this.selected.has(id))) this.groups.delete(key)
    }
  }

  // ---- serialization ----
  snapshot(): StoreSnapshot {
    return {
      strokes: this.all().map((s) => s.toJSON()),
      selected: [...this.selected],
      groups: Object.fromEntries(this.groups)
    }
  }

  restore(snap: StoreSnapshot, hydrate: (json: any) => Stroke | null) {
    this.strokes.clear()
    const idMap = new Map<number, number>()
    let maxId = 0
    for (const json of snap.strokes) {
      const s = hydrate(json)
      if (!s) continue
      // Re-assign a globally unique id: snapshots (ours from older builds, or
      // desktop .rnote imports) can contain colliding per-type ids.
      const oldId = s.id
      const newId = nextStrokeId()
      s.id = newId
      idMap.set(oldId, newId)
      maxId = Math.max(maxId, newId)
      this.strokes.set(newId, s)
    }
    seedStrokeIds(maxId)
    this.selected = new Set((snap.selected ?? []).map((id) => idMap.get(id) ?? id))
    this.groups = new Map(
      Object.entries(snap.groups ?? {}).map(([k, ids]) => [k, ids.map((id) => idMap.get(id) ?? id)])
    )
    this.bump()
  }
}

function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function polylineIntersectsPolygon(s: Stroke, polygon: Vec2[]): boolean {
  // generic bounds-edge intersection test
  const b = s.bounds()
  const edges: [Vec2, Vec2][] = []
  for (let i = 0; i < polygon.length; i++) edges.push([polygon[i], polygon[(i + 1) % polygon.length]])
  const corners = b.vertices()
  for (let i = 0; i < 4; i++) {
    const a = corners[i]
    const c = corners[(i + 1) % 4]
    for (const [p, q] of edges) if (segmentsIntersect(a, c, p, q)) return true
  }
  return false
}

function segmentsIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const d = (a: Vec2, b: Vec2, c: Vec2) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const d1 = d(p3, p4, p1)
  const d2 = d(p3, p4, p2)
  const d3 = d(p1, p2, p3)
  const d4 = d(p1, p2, p4)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}
