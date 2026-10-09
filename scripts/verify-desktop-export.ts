// Regression for the native desktop .rnote writer (desktop-export.ts):
//  1. builds a web snapshot with every non-bitmap stroke kind,
//  2. serializes to the desktop 0.15 schema and asserts exact serde tags,
//  3. feeds it back through desktop-import.ts and asserts the round trip.
// Bitmap raw-RGBA encoding requires a browser canvas and is covered by the
// browser smoke test.

import { Vec2 } from '../src/compose/geometry'
import { Color } from '../src/compose/style/color'
import { SmoothOptions, TexturedOptions, RoughOptions, StrokeLayer } from '../src/compose/style/options'
import { PenPath, Element } from '../src/compose/penpath/penpath'
import { BrushStyleKind } from '../src/engine/pens/pensconfig'
import { BrushStroke } from '../src/engine/strokes/brushstroke'
import { ShapeStroke } from '../src/engine/strokes/shapestroke'
import { TextStroke, TextStyle, TextAlignment } from '../src/engine/strokes/textstroke'
import { VectorImageStroke } from '../src/engine/strokes/imagestroke'
import {
  LineShape,
  ArrowShape,
  RectangleShape,
  EllipseShape,
  PolygonShape,
  QuadBezShape,
  CubBezShape
} from '../src/compose/shapes/shape'
import { Aabb } from '../src/compose/geometry'
import { buildDesktopSnapshot } from '../src/engine/fileformats/desktop-export'
import { mapDesktopSnapshot } from '../src/engine/fileformats/desktop-import'

// @ts-expect-error -- minimal browser stub for Node regression test
globalThis.Image = class {
  complete = false
  set src(_: string) {}
}

let failures = 0
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`PASS ${name}`)
  } else {
    failures++
    console.error(`FAIL ${name} ${detail}`)
  }
}
function approx(a: number, b: number, eps = 1e-2): boolean {
  return Math.abs(a - b) <= eps
}

function el(x: number, y: number, p = 0.5): Element {
  return new Element(new Vec2(x, y), p)
}

async function main() {
  const smooth = new SmoothOptions()
  smooth.stroke_width = 4
  smooth.stroke_color = new Color(0.1, 0.2, 0.3, 1)
  smooth.pressure_curve = 'linear' as any

  const markerSmooth = new SmoothOptions()
  markerSmooth.stroke_width = 18
  markerSmooth.stroke_color = new Color(1, 1, 0, 0.5)
  markerSmooth.pressure_curve = 'const' as any
  const marker = new BrushStroke(
    new PenPath([el(0, 0, 0.5), el(50, 10, 0.6), el(100, 0, 0.5)]),
    BrushStyleKind.Marker,
    markerSmooth,
    new TexturedOptions()
  )
  marker.layer = StrokeLayer.Highlighter

  const texturedOpts = new TexturedOptions()
  texturedOpts.seed = 42
  texturedOpts.stroke_width = 6
  texturedOpts.distribution = 'normal' as any
  const textured = new BrushStroke(
    new PenPath([el(0, 100), el(40, 110), el(90, 90)]),
    BrushStyleKind.Textured,
    new SmoothOptions(),
    texturedOpts
  )

  const rough = new RoughOptions()
  rough.seed = 12345
  rough.fill_style = 'solid' as any
  const shapeStroke = new ShapeStroke(
    [
      new LineShape(new Vec2(0, 0), new Vec2(100, 0)),
      new ArrowShape(new Vec2(0, 20), new Vec2(100, 20)),
      new RectangleShape(new Aabb(new Vec2(0, 40), new Vec2(60, 90))),
      new EllipseShape(new Vec2(120, 65), new Vec2(30, 20), 0.3),
      new PolygonShape([new Vec2(0, 120), new Vec2(40, 110), new Vec2(60, 150)], true),
      new QuadBezShape(new Vec2(0, 200), new Vec2(50, 160), new Vec2(100, 200)),
      new CubBezShape(new Vec2(0, 260), new Vec2(40, 220), new Vec2(80, 300), new Vec2(120, 260))
    ],
    { smooth, rough, roughEnabled: false }
  )
  const roughShape = new ShapeStroke(
    [new LineShape(new Vec2(0, 320), new Vec2(100, 320))],
    { smooth: new SmoothOptions(), rough, roughEnabled: true }
  )

  const ts = new TextStyle()
  ts.family = 'sans-serif'
  ts.size = 40
  ts.weight = 700
  ts.italic = true
  ts.underline = true
  ts.alignment = TextAlignment.Center
  const text = new TextStroke('Hello<br>Rnote', new Vec2(40, 400), 300, ts)

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" fill="red"/></svg>'
  const vector = new VectorImageStroke(svg, new Aabb(new Vec2(0, 460), new Vec2(100, 510)))

  const webSnap: any = {
    version: { major: 0, minor: 15, patch: 0 },
    document: {
      format: { width: 794, height: 1123, dpi: 96, orientation: 'portrait', border_color: { r: 0.8, g: 0.8, b: 0.8, a: 1 }, show_border: true },
      background: { color: { r: 1, g: 1, b: 1, a: 1 }, pattern: 'dots', pattern_size: { x: 32, y: 32 }, pattern_color: { r: 0.8, g: 0.9, b: 1, a: 1 } },
      layout: 'infinite',
      pages: 1
    },
    camera: { offset: { x: -100, y: -200 }, size: { x: 1024, y: 768 }, zoom: 0.8 },
    store: {
      strokes: [marker, textured, shapeStroke, roughShape, text, vector].map((s: any) => s.toJSON()),
      selected: [],
      groups: {}
    }
  }

  const desktop = await buildDesktopSnapshot(webSnap)
  const comps = desktop.stroke_components.map((c: any) => c.value)
  const byKind = (k: string) => comps.filter((c: any) => c && c[k])

  check('outer component count (7 smooth shapes + 1 rough + brush*2 + text + vector)', comps.length === 12, `got ${comps.length}`)
  check('chrono components parallel', desktop.chrono_components.length === comps.length)
  check('chrono_counter equals components', desktop.chrono_counter === comps.length)
  check('document config layout', desktop.document.config.layout === 'infinite')
  check('document has bounds', desktop.document.width > 0 && desktop.document.height > 0, JSON.stringify(desktop.document))
  check('camera size/zoom', JSON.stringify(desktop.camera.size) === '[1024,768]' && approx(desktop.camera.zoom, 0.8), JSON.stringify(desktop.camera))

  const layoutSnap = (layout: string, camera: any) => ({
    version: webSnap.version,
    document: {
      format: { width: 200, height: 300, dpi: 96, orientation: 'portrait' },
      background: { color: { r: 1, g: 1, b: 1, a: 1 }, pattern: 'dots', pattern_size: { x: 32, y: 32 }, pattern_color: { r: 0.8, g: 0.9, b: 1, a: 1 } },
      layout
    },
    camera,
    store: { strokes: [], selected: [], groups: {} }
  })
  const fixed = await buildDesktopSnapshot(layoutSnap('fixed_size', { offset: { x: -50, y: -60 }, size: { x: 100, y: 100 }, zoom: 1 }))
  check('fixed layout matches Rust page sizing', fixed.document.x === 0 && fixed.document.y === 0 && fixed.document.width === 200 && fixed.document.height === 300, JSON.stringify(fixed.document))
  const semi = await buildDesktopSnapshot(layoutSnap('semi_infinite', { offset: { x: -50, y: -60 }, size: { x: 100, y: 100 }, zoom: 1 }))
  check('semi-infinite layout only grows right/bottom', semi.document.x === 0 && semi.document.y === 0 && semi.document.width === 850 && semi.document.height === 1240, JSON.stringify(semi.document))
  const infinite = await buildDesktopSnapshot(layoutSnap('infinite', { offset: { x: -50, y: -60 }, size: { x: 100, y: 100 }, zoom: 1 }))
  check('infinite layout grows in all directions', infinite.document.x === -850 && infinite.document.y === -1260 && infinite.document.width === 1700 && infinite.document.height === 2500, JSON.stringify(infinite.document))

  const markerNative = byKind('brushstroke').find((c: any) => c.brushstroke.style.smooth?.pressure_curve === 'const')
  check('marker smooth const style', !!markerNative)
  const markerChrono = desktop.chrono_components[comps.indexOf(markerNative)].value
  check('marker chrono highlighter layer', markerChrono.layer === 'highlighter', JSON.stringify(markerChrono))

  const texturedNative = byKind('brushstroke').find((c: any) => c.brushstroke.style.textured)
  check('textured brush style tag', !!texturedNative?.brushstroke?.style?.textured)
  check(
    'textured distribution PascalCase + seed/density',
    texturedNative?.brushstroke?.style?.textured?.distribution === 'Normal' &&
      texturedNative.brushstroke.style.textured.seed === 42 &&
      texturedNative.brushstroke.style.textured.density === 5,
    JSON.stringify(texturedNative?.brushstroke?.style)
  )
  const firstSeg = texturedNative.brushstroke.path.segments[0]
  check('brush path lineto element tags', !!firstSeg.lineto?.end?.pos && typeof firstSeg.lineto.end.pressure === 'number')

  const shapeNative = byKind('shapestroke')
  const tags = shapeNative.map((c: any) => Object.keys(c.shapestroke.shape)[0])
  check(
    'shape primitive tags',
    JSON.stringify(tags) === JSON.stringify(['line', 'arrow', 'rect', 'ellipse', 'polygon', 'quadbez', 'cubbez', 'line']),
    JSON.stringify(tags)
  )
  const arrow = shapeNative.find((c: any) => c.shapestroke.shape.arrow)
  check('arrow uses tip field', Array.isArray(arrow.shapestroke.shape.arrow.tip) && !('end' in arrow.shapestroke.shape.arrow))
  const rect = shapeNative.find((c: any) => c.shapestroke.shape.rect)
  check('rect cuboid + center affine', rect.shapestroke.shape.rect.cuboid.half_extents[0] === 30 && rect.shapestroke.shape.rect.affine[4] === 30)
  const roughNative = shapeNative.find((c: any) => c.shapestroke.style.rough)
  check('rough style fields', roughNative.shapestroke.style.rough.seed === 12345 && roughNative.shapestroke.style.rough.fill_style === 'solid')
  const smoothNative = shapeNative.find((c: any) => c.shapestroke.style.smooth)
  check('smooth shape style fields', smoothNative.shapestroke.style.smooth.stroke_width === 4)

  const textNative = byKind('textstroke')[0].textstroke
  check('text plain content + newline', textNative.text === 'Hello\nRnote', textNative.text)
  check('text font family/weight/style', textNative.text_style.font_family === 'sans-serif' && textNative.text_style.font_weight === 700 && textNative.text_style.font_style === 'italic')
  const attrKinds = textNative.text_style.ranged_text_attributes.map((a: any) => Object.keys(a.attribute)[0])
  check('text ranged attrs', JSON.stringify(attrKinds) === JSON.stringify(['font_weight', 'underline']), JSON.stringify(attrKinds))
  check('text alignment + max width', textNative.text_style.alignment === 'center' && textNative.text_style.max_width === 300)

  const vecNative = byKind('vectorimage')[0].vectorimage
  check(
    'vector intrinsic + affine',
    vecNative.intrinsic_size[0] === 200 && vecNative.intrinsic_size[1] === 100 &&
      JSON.stringify(vecNative.rectangle.cuboid.half_extents) === '[50,25]' &&
      vecNative.rectangle.affine[0] === 1 && vecNative.rectangle.affine[3] === 1 &&
      approx(vecNative.rectangle.affine[4], 50) && approx(vecNative.rectangle.affine[5], 485),
    JSON.stringify(vecNative.rectangle)
  )

  // Round trip through the desktop importer.
  const round = mapDesktopSnapshot(desktop)
  const roundStrokes = round.store.strokes
  check('roundtrip stroke count', roundStrokes.length === comps.length, `${roundStrokes.length} vs ${comps.length}`)
  const roundKinds = roundStrokes.map((s: any) => s.kind).sort()
  const expectedKinds = comps
    .map((c: any) => (c.brushstroke ? 'brush' : c.shapestroke ? 'shape' : c.textstroke ? 'text' : 'vector'))
    .sort()
  check('roundtrip stroke kinds', JSON.stringify(roundKinds) === JSON.stringify(expectedKinds), JSON.stringify(roundKinds))
  const roundMarker = roundStrokes.find((s: any) => s.kind === 'brush' && s.style_kind === 'marker')
  check('roundtrip marker layer', roundMarker?.layer === StrokeLayer.Highlighter)
  const roundText = roundStrokes.find((s: any) => s.kind === 'text')
  check('roundtrip text content', roundText?.html.includes('Hello') && roundText.html.includes('Rnote'))
  const roundVec = roundStrokes.find((s: any) => s.kind === 'vector')
  check('roundtrip vector svg + bounds', roundVec?.svg_source.includes('<svg') && approx(roundVec.rect.max.x - roundVec.rect.min.x, 100))

  if (failures) {
    console.error(`\n${failures} desktop export check(s) failed`)
    process.exit(1)
  }
  console.log('\nPASS desktop .rnote writer schema + roundtrip')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
