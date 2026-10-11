// Document-space content tiles. Dense hand-written documents have hundreds of
// overlapping strokes (real samples reach ~280x overdraw); re-running every
// stroke sprite on each frame is by far the dominant cost. The desktop keeps
// rasterised rendernodes around and composites them on the GPU after doing the
// rasterisation on background threads (render_comp.rs). On the Web main thread
// the equivalent is to pre-flatten the (mostly static) strokes into a grid of
// document-space tile bitmaps once, then blit only the handful of visible tiles
// per frame. Tiles are (re)built off the interaction critical path with a
// small per-frame budget; regions whose tiles are not ready are drawn directly
// so content never blanks out.

import { Aabb, Vec2 } from '../../compose/geometry'
import type { Engine } from '../engine'

export const TILE_DOC = 360
const TILE_MARGIN = 80

export class ContentTiles {
  private tiles = new Map<string, HTMLCanvasElement>()
  private scale = 0
  private engine: Engine

  constructor(engine: Engine) {
    this.engine = engine
  }

  // Rebind to a different engine (when the singleton renderer switches active
  // tab) and drop every cached tile, which rasterised the previous engine.
  bind(engine: Engine) {
    if (this.engine === engine) return
    this.engine = engine
    this.tiles.clear()
    this.scale = 0
  }

  private key(i: number, j: number) {
    return `${i},${j}`
  }
  private static tileAabb(i: number, j: number) {
    return new Aabb(
      new Vec2(i * TILE_DOC, j * TILE_DOC),
      new Vec2((i + 1) * TILE_DOC, (j + 1) * TILE_DOC)
    )
  }

  // Tiles are rasterised at the exact device scale. A small tolerance lets small
  // zoom changes reuse the existing tiles (cheap drawImage scale); a larger zoom
  // (e.g. after a pinch) rebuilds. Rasterising at the exact scale means a freshly
  // committed stroke's tile matches the live overlay pixel-for-pixel, instead of
  // differing via a coarse 0.5-step resolution bucket (which "popped"/flashed on
  // quick touch strokes after zooming).
  private static readonly SCALE_TOLERANCE = 0.1

  // (Re)build tiles covering `viewport` until the budget is used. Returns true
  // when every tile in the viewport is ready.
  update(viewport: Aabb, eff: number, budgetMs: number): boolean {
    if (this.scale === 0 || Math.abs(this.scale - eff) > this.scale * ContentTiles.SCALE_TOLERANCE) {
      this.tiles.clear()
      this.scale = eff
    }
    const region = viewport.extend_by(TILE_MARGIN)
    const i0 = Math.floor(region.min.x / TILE_DOC)
    const i1 = Math.floor(region.max.x / TILE_DOC)
    const j0 = Math.floor(region.min.y / TILE_DOC)
    const j1 = Math.floor(region.max.y / TILE_DOC)
    const deadline = performance.now() + budgetMs
    let allBuilt = true
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = this.key(i, j)
        if (!this.tiles.has(k)) {
          if (performance.now() > deadline) {
            allBuilt = false
            continue
          }
          this.tiles.set(k, this.buildTile(i, j))
        }
      }
    }
    return allBuilt
  }

  private buildTile(i: number, j: number): HTMLCanvasElement {
    const ta = ContentTiles.tileAabb(i, j)
    const s = this.scale
    const px = Math.max(2, Math.round(TILE_DOC * s))
    const c = document.createElement('canvas')
    c.width = px
    c.height = px
    const x = c.getContext('2d')!
    x.scale(s, s)
    x.translate(-ta.min.x, -ta.min.y)
    x.beginPath()
    x.rect(ta.min.x, ta.min.y, TILE_DOC, TILE_DOC)
    x.clip()
    for (const st of this.engine.store.ordered()) {
      const b = st.bounds()
      if (!b.zero() && !ta.intersects(b)) continue
      x.save()
      st.draw(x, s)
      x.restore()
    }
    return c
  }

  // Blit ready tiles in the current (document-space) transform. Returns the
  // list of visible tile boxes that are not ready yet (for direct-draw fallback).
  blit(ctx: CanvasRenderingContext2D, viewport: Aabb): Aabb[] {
    const region = viewport.extend_by(TILE_MARGIN)
    const i0 = Math.floor(region.min.x / TILE_DOC)
    const i1 = Math.floor(region.max.x / TILE_DOC)
    const j0 = Math.floor(region.min.y / TILE_DOC)
    const j1 = Math.floor(region.max.y / TILE_DOC)
    const missing: Aabb[] = []
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = this.tiles.get(this.key(i, j))
        const ta = ContentTiles.tileAabb(i, j)
        if (c) {
          ctx.drawImage(c, ta.min.x, ta.min.y, TILE_DOC, TILE_DOC)
        } else {
          missing.push(ta)
        }
      }
    }
    return missing
  }

  invalidateAll() {
    this.tiles.clear()
    this.scale = 0
  }

  // Drop only the tiles intersecting `bounds` (right after one stroke is added
  // or changed), keeping the resolution bucket and every other tile intact.
  // Invalidating the whole cache on every stroke commit forced a full-screen
  // direct-draw + rebuild, which read as a one-frame flash.
  invalidateRegion(bounds: Aabb) {
    if (!bounds || bounds.zero()) return
    const region = bounds.extend_by(12)
    const i0 = Math.floor(region.min.x / TILE_DOC)
    const i1 = Math.floor(region.max.x / TILE_DOC)
    const j0 = Math.floor(region.min.y / TILE_DOC)
    const j1 = Math.floor(region.max.y / TILE_DOC)
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) this.tiles.delete(this.key(i, j))
    }
    // this.scale is preserved: the zoom / resolution bucket did not change.
  }
}
