// Port of rnote-engine Camera: maps document <-> screen coordinates and
// handles zoom (anchored at a focal point) and panning.
//
// Coordinate model, identical to the desktop Rust camera:
//   * `offset` is the viewport top-left in SURFACE (CSS-pixel, already zoomed)
//     coordinates, defaulting to (-96, -96) (the OVERSHOOT margin).
//   * surface = doc * zoom - offset        (docToScreen)
//   * doc     = (surface + offset) / zoom  (screenToDoc)
//   * the visible document rect is offset/zoom .. (offset + size)/zoom.

import { Vec2, Aabb, clamp } from '../../compose/geometry'

export class Camera {
  // Viewport top-left in surface coordinates. Mirrors Camera::default() /
  // OVERSHOOT_HORIZONTAL / OVERSHOOT_VERTICAL (= 96).
  offset: Vec2 = new Vec2(-96, -96)
  zoom = 1.0
  viewportSize: Vec2 = new Vec2(800, 600)

  static MIN_ZOOM = 0.2
  static MAX_ZOOM = 6.0
  static ZOOM_STEP = 0.1
  static OVERSHOOT = 96

  clone(): Camera {
    const c = new Camera()
    c.offset = this.offset.clone()
    c.zoom = this.zoom
    c.viewportSize = this.viewportSize.clone()
    return c
  }

  setViewport(size: Vec2) {
    this.viewportSize = size.clone()
  }

  // surface = doc * zoom - offset
  docToScreen(p: Vec2): Vec2 {
    return p.mul(this.zoom).sub(this.offset)
  }
  // doc = (surface + offset) / zoom
  screenToDoc(p: Vec2): Vec2 {
    return p.add(this.offset).div(this.zoom)
  }
  scaleToScreen(s: number): number {
    return s * this.zoom
  }

  get zoomPercent(): number {
    return Math.round(this.zoom * 100)
  }

  setZoom(zoom: number, focalScreen: Vec2 | null = null) {
    const newZoom = clamp(zoom, Camera.MIN_ZOOM, Camera.MAX_ZOOM)
    if (focalScreen) {
      // Keep the document point under the focal fixed across the zoom.
      const doc = this.screenToDoc(focalScreen)
      this.zoom = newZoom
      this.offset = doc.mul(newZoom).sub(focalScreen)
    } else {
      this.zoom = newZoom
    }
  }

  zoomBy(factor: number, focalScreen: Vec2 | null = null) {
    this.setZoom(this.zoom * factor, focalScreen ?? this.viewportSize.mul(0.5))
  }

  zoomIn(focal?: Vec2) {
    this.zoomBy(1 + Camera.ZOOM_STEP * 2, focal)
  }
  zoomOut(focal?: Vec2) {
    this.zoomBy(1 / (1 + Camera.ZOOM_STEP * 2), focal)
  }

  // Pan by a delta expressed in surface (screen) pixels.
  panBy(deltaScreen: Vec2) {
    this.offset = this.offset.sub(deltaScreen)
  }

  // Visible viewport center in document coords.
  viewportCenter(): Vec2 {
    return this.offset.add(this.viewportSize.mul(0.5)).div(this.zoom)
  }

  // Center the view on a document point.
  centerOn(docPoint: Vec2) {
    this.offset = docPoint.mul(this.zoom).sub(this.viewportSize.mul(0.5))
  }

  // Center only horizontally on a document x, keeping the vertical position.
  centerXOn(docX: number) {
    this.offset.x = docX * this.zoom - this.viewportSize.x / 2
  }

  // Fit a document rectangle into the viewport with margins.
  fitBounds(bounds: Aabb, margin = 40) {
    if (bounds.zero()) return
    const w = bounds.width()
    const h = bounds.height()
    const zx = (this.viewportSize.x - margin * 2) / w
    const zy = (this.viewportSize.y - margin * 2) / h
    this.zoom = clamp(Math.min(zx, zy), Camera.MIN_ZOOM, Camera.MAX_ZOOM)
    this.centerOn(bounds.center())
  }

  fitWidth(bounds: Aabb, margin = 60) {
    if (bounds.zero()) return
    // Desktop uses scroller width / (format width + 2 * overshoot).
    this.zoom = clamp(
      this.viewportSize.x / (bounds.width() + 2 * Camera.OVERSHOOT),
      Camera.MIN_ZOOM,
      Camera.MAX_ZOOM
    )
    this.centerOn(new Vec2(bounds.center().x, bounds.min.y + bounds.height() * 0.25))
  }

  // 100% zoom, keeping the current viewport center (desktop "zoom-reset").
  realSize() {
    const c = this.viewportCenter()
    this.zoom = 1
    this.centerOn(c)
  }

  reset() {
    const c = this.viewportCenter()
    this.zoom = 1
    this.centerOn(c)
  }

  visibleDocBounds(): Aabb {
    return new Aabb(this.offset.div(this.zoom), this.offset.add(this.viewportSize).div(this.zoom))
  }

  toJSON() {
    return {
      offset: { x: this.offset.x, y: this.offset.y },
      size: { x: this.viewportSize.x, y: this.viewportSize.y },
      zoom: this.zoom
    }
  }
  static fromJSON(o: any): Camera {
    const c = new Camera()
    if (!o) return c
    // Desktop stores offset in surface coords verbatim.
    c.offset = o.offset ? new Vec2(o.offset.x, o.offset.y) : c.offset
    c.viewportSize = o.size
      ? new Vec2(o.size.x ?? o.size[0] ?? 800, o.size.y ?? o.size[1] ?? 600)
      : c.viewportSize
    c.zoom = num(o.zoom, 1)
    return c
  }
}

function num(v: any, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d
}
