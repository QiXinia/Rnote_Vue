// Test helper: populate an engine with rough/smooth shape strokes and a textured
// brush covering every style path, so the native writer can be validated.
import { shapeFromJSON } from '../src/compose/shapes/shape'
import { SmoothOptions, RoughOptions, TexturedOptions } from '../src/compose/style/options'
import { Color } from '../src/compose/style/color'
import { ShapeStroke } from '../src/engine/strokes/shapestroke'
import { BrushStroke, BrushStyleKind } from '../src/engine/strokes/brushstroke'
import { PenPath, Element } from '../src/compose/penpath/penpath'
import type { Engine } from '../src/engine/engine'

function mkSmooth(): SmoothOptions {
  const s = new SmoothOptions()
  s.stroke_width = 4
  s.stroke_color = new Color(0, 0, 0, 1)
  s.fill_color = null
  return s
}
function mkRough(fillStyle?: string): RoughOptions {
  const r = new RoughOptions()
  r.stroke_width = 4
  r.stroke_color = new Color(0, 0, 0, 1)
  r.fill_color = new Color(0.8, 0.2, 0.2, 0.5)
  if (fillStyle) r.fill_style = fillStyle as any
  r.seed = 12345
  return r
}

export function populateTestStrokes(engine: Engine): number {
  const rect = shapeFromJSON({
    kind: 'rectangle',
    rect: { min: { x: 100, y: 600 }, max: { x: 400, y: 820 } },
    cornerRadius: 0
  })!
  const ss1 = new ShapeStroke([rect], { smooth: mkSmooth(), rough: mkRough(), roughEnabled: true })

  const ell = shapeFromJSON({
    kind: 'ellipse',
    center: { x: 620, y: 710 },
    radii: { x: 130, y: 90 },
    rotation: 0
  })!
  const ss2 = new ShapeStroke([ell], { smooth: mkSmooth(), rough: mkRough(), roughEnabled: false })

  // rough shape whose fill_style is the web-only "none" (must be downgraded)
  const rect2 = shapeFromJSON({
    kind: 'rectangle',
    rect: { min: { x: 100, y: 860 }, max: { x: 300, y: 1000 } },
    cornerRadius: 0
  })!
  const ss3 = new ShapeStroke([rect2], {
    smooth: mkSmooth(),
    rough: mkRough('none'),
    roughEnabled: true
  })

  // textured brush, reverse-exponential distribution
  const t = new TexturedOptions()
  t.stroke_width = 8
  t.stroke_color = new Color(0.1, 0.1, 0.6, 1)
  t.distribution = 'reverse_exponential' as any
  const elements: Element[] = []
  for (let i = 0; i <= 12; i++) {
    elements.push(new Element({ x: 120 + i * 40, y: 1100 }, 0.5))
  }
  const penPath = new PenPath(elements)
  const bs = new BrushStroke(penPath, BrushStyleKind.Textured, new SmoothOptions(), t)

  engine.commitAddStrokes([ss1, ss2, ss3, bs] as any)
  return engine.snapshot().store.strokes.length
}
