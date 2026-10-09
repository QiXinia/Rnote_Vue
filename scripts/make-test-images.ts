// Test helper: add a vector (SVG) and a bitmap (raster) image stroke.
import { VectorImageStroke, BitmapImageStroke } from '../src/engine/strokes/imagestroke'
import { Aabb } from '../src/compose/geometry/aabb'
import type { Engine } from '../src/engine/engine'

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
<rect width="200" height="200" fill="#3366cc"/>
<circle cx="100" cy="100" r="60" fill="#ffcc33"/>
</svg>`

export async function populateImages(engine: Engine): Promise<number> {
  const vs = new VectorImageStroke(SVG, new Aabb({ x: 100, y: 1200 }, { x: 300, y: 1400 }))

  const cv = document.createElement('canvas')
  cv.width = 64
  cv.height = 48
  const c = cv.getContext('2d')!
  c.fillStyle = '#cc3333'
  c.fillRect(0, 0, 64, 48)
  c.fillStyle = '#ffcc33'
  c.beginPath()
  c.arc(32, 24, 15, 0, Math.PI * 2)
  c.fill()
  const dataUrl = cv.toDataURL('image/png')
  const bs = new BitmapImageStroke(
    dataUrl,
    new Aabb({ x: 420, y: 1200 }, { x: 420 + 64 * 3, y: 1200 + 48 * 3 }),
    64,
    48
  )

  engine.commitAddStrokes([vs, bs] as any)
  return engine.snapshot().store.strokes.length
}
