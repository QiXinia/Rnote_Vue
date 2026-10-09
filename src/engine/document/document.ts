// Port of rnote-engine document/mod.rs: ties together background, format and
// layout and computes page geometry.

import { Vec2, Aabb } from '../../compose/geometry'
import { Background } from './background'
import { Format } from './format'
import { Layout, isFixedSize } from './layout'

export const PAGE_GAP = 48 // px culling/visual margin around pages
export const PAGE_SHADOW_PADDING = 24

export class Document {
  background = new Background()
  format = new Format()
  layout: Layout = Layout.Infinite
  // number of pages for fixed-size layouts
  pages = 1

  static default(): Document {
    return new Document()
  }

  clone(): Document {
    const d = new Document()
    d.background = this.background.clone()
    d.format = this.format.clone()
    d.layout = this.layout
    d.pages = this.pages
    return d
  }

  get width(): number {
    return this.format.width
  }
  get height(): number {
    return this.format.height
  }

  // Bounds of page i (0-indexed). Pages are stacked vertically with their
  // top-left at the document origin, exactly like the desktop document whose
  // bounds start at (x, y) = (0, 0) and are split origin-aligned into pages
  // (fixed-size pages are contiguous, with no inter-page gap).
  pageBounds(index = 0): Aabb {
    const w = this.format.width
    const h = this.format.height
    const xMin = 0
    const yMin = index * h
    return new Aabb(new Vec2(xMin, yMin), new Vec2(xMin + w, yMin + h))
  }

  // Union bounds of all fixed-size pages.
  fixedBounds(): Aabb {
    let b = this.pageBounds(0)
    for (let i = 1; i < this.pages; i++) b = b.union(this.pageBounds(i))
    return b
  }

  addPage(): number {
    this.pages += 1
    return this.pages
  }

  removePage(): number {
    this.pages = Math.max(1, this.pages - 1)
    return this.pages
  }

  // Returns the page index containing a point (fixed layout), else -1.
  pageAtPoint(p: Vec2): number {
    if (!isFixedSize(this.layout)) return 0
    for (let i = 0; i < this.pages; i++) {
      if (this.pageBounds(i).contains(p)) return i
    }
    return -1
  }

  // Returns the document region to render for a visible viewport.
  renderRegion(viewport: Aabb, contentBounds: Aabb | null): { pages: Aabb[]; infinite: Aabb | null } {
    if (this.layout === Layout.FixedSize) {
      const pages: Aabb[] = []
      for (let i = 0; i < this.pages; i++) {
        const b = this.pageBounds(i)
        if (b.intersects(viewport.extend_by(PAGE_GAP))) pages.push(b)
      }
      return { pages, infinite: null }
    }
    if (this.layout === Layout.SemiInfinite || this.layout === Layout.ContinuousVertical) {
      // fixed-width column starting at the document origin, infinite height
      const w = this.format.width
      const xMin = 0
      let yMin = viewport.min.y
      let yMax = viewport.max.y
      if (contentBounds && !contentBounds.zero()) {
        yMin = Math.min(yMin, contentBounds.min.y - PAGE_GAP)
        yMax = Math.max(yMax, contentBounds.max.y + PAGE_GAP)
      }
      const col = new Aabb(new Vec2(xMin, yMin), new Vec2(xMin + w, yMax))
      return { pages: [col], infinite: null }
    }
    // Infinite: pattern fills the viewport; border hugs content bounds.
    return { pages: [], infinite: viewport.extend_by(400) }
  }

  toJSON() {
    return {
      background: this.background.toJSON(),
      format: this.format.toJSON(),
      layout: this.layout,
      pages: this.pages
    }
  }

  static fromJSON(o: any): Document {
    const d = new Document()
    if (!o) return d
    d.background = Background.fromJSON(o.background)
    d.format = Format.fromJSON(o.format)
    d.layout = o.layout ?? Layout.Infinite
    d.pages = o.pages ?? 1
    return d
  }
}
