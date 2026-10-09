import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { mapDesktopSnapshot } from '../src/engine/fileformats/desktop-import'
import { strokeLayerRank, StrokeLayer } from '../src/compose/style/options'

class FakeImageData {
  width: number
  height: number
  data: Uint8ClampedArray
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.data = new Uint8ClampedArray(width * height * 4)
  }
}
class FakeImage {
  complete = false
  naturalWidth = 0
  naturalHeight = 0
  set src(_: string) {}
}

function installBrowserStubs(warnings: string[]) {
  const ctx = {
    putImageData() {},
    drawImage() {}
  }
  // @ts-expect-error -- minimal browser stub for Node regression test
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ctx,
      toDataURL: () => 'data:image/png;base64,'
    })
  }
  // @ts-expect-error -- minimal browser stub for Node regression test
  globalThis.ImageData = FakeImageData
  // @ts-expect-error -- minimal browser stub for Node regression test
  globalThis.Image = FakeImage
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '))
  }
  return () => {
    console.warn = originalWarn
  }
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.rnote') ? [p] : []
  })
}

function unwrap<T = any>(component: any): T | null {
  return component && typeof component === 'object' && 'value' in component ? component.value : component
}

function components(snapshot: any, key: string): any[] {
  return snapshot?.store?.[key] ?? snapshot?.store_snapshot?.[key] ?? snapshot?.[key] ?? []
}

function parseLayer(layer: any): StrokeLayer {
  if (!layer) return StrokeLayer.UserLayer
  if (typeof layer === 'string') {
    const s = layer.toLowerCase()
    if (s === 'document') return StrokeLayer.Document
    if (s === 'image') return StrokeLayer.Image
    if (s === 'highlighter') return StrokeLayer.Highlighter
  }
  if (typeof layer === 'object') {
    const keys = Object.keys(layer)
    if (keys.includes('document')) return StrokeLayer.Document
    if (keys.includes('image')) return StrokeLayer.Image
    if (keys.includes('highlighter')) return StrokeLayer.Highlighter
  }
  return StrokeLayer.UserLayer
}

function inc(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1
}

function rawStats(snapshot: any) {
  const strokes = components(snapshot, 'stroke_components')
  const chrono = components(snapshot, 'chrono_components')
  const counts: Record<string, number> = {}
  const brushStyles: Record<string, number> = {}
  const shapeStyles: Record<string, number> = {}
  const shapes: Record<string, number> = {}
  const layers: Record<string, number> = {}
  const problems: string[] = []

  strokes.forEach((component, index) => {
    const value = unwrap(component)
    if (!value || typeof value !== 'object') return
    const tag = ['brushstroke', 'shapestroke', 'textstroke', 'vectorimage', 'bitmapimage'].find((k) => k in value)
    if (!tag) return
    inc(counts, tag)
    const chronoValue = unwrap<any>(chrono[index])
    const layer = chronoValue?.layer ? parseLayer(chronoValue.layer) : StrokeLayer.UserLayer
    inc(layers, layer)
    const stroke = value[tag]
    const style = stroke?.style
    if (style && typeof style === 'object') {
      const styleTag = Object.keys(style)[0]
      if (tag === 'brushstroke') inc(brushStyles, styleTag)
      if (tag === 'shapestroke') inc(shapeStyles, styleTag)
    }
    if (tag === 'shapestroke' && stroke?.shape) inc(shapes, Object.keys(stroke.shape)[0])
    if ((tag === 'vectorimage' || tag === 'bitmapimage') && !stroke.rectangle) {
      problems.push(`${tag}@${index} missing rectangle`)
    }
  })

  return {
    counts,
    brushStyles,
    shapeStyles,
    shapes,
    layers,
    problems,
    total: Object.values(counts).reduce((a, b) => a + b, 0)
  }
}

function mappedStats(snapshot: any) {
  const counts: Record<string, number> = {}
  const brushKinds: Record<string, number> = {}
  const shapeStyles: Record<string, number> = {}
  const shapes: Record<string, number> = {}
  const layers: Record<string, number> = {}
  const problems: string[] = []
  let previousRank = -1

  for (const stroke of snapshot.store.strokes) {
    inc(counts, stroke.kind)
    inc(layers, stroke.layer ?? StrokeLayer.UserLayer)
    const rank = strokeLayerRank(stroke.layer ?? StrokeLayer.UserLayer)
    if (rank < previousRank) problems.push(`layer order broken at ${stroke.id}`)
    previousRank = rank

    if (stroke.kind === 'brush') {
      inc(brushKinds, stroke.style_kind)
      if (!Array.isArray(stroke.elements) || stroke.elements.length < 2) problems.push(`brush ${stroke.id} has <2 elements`)
      if (!stroke.smooth?.stroke_width) problems.push(`brush ${stroke.id} missing width`)
      if (stroke.style_kind === 'marker' && stroke.smooth?.pressure_curve !== 'const') {
        problems.push(`marker ${stroke.id} is not constant pressure`)
      }
    }
    if (stroke.kind === 'shape') {
      inc(shapeStyles, stroke.rough_enabled ? 'rough' : 'smooth')
      for (const shape of stroke.shapes ?? []) inc(shapes, shape.kind)
      if (!stroke.shapes?.length) problems.push(`shape ${stroke.id} has no primitives`)
    }
    if (stroke.kind === 'text' && !(stroke.html || '').replace(/<br\s*\/?>/g, '').trim()) problems.push(`text ${stroke.id} empty`)
    if (stroke.kind === 'bitmap' && !(stroke.data_url || '').startsWith('data:image/')) problems.push(`bitmap ${stroke.id} not encoded`)
    if (stroke.kind === 'vector' && !(stroke.svg_source || '').includes('<svg')) problems.push(`vector ${stroke.id} missing svg`)
    if (stroke.kind === 'bitmap' || stroke.kind === 'vector') {
      const w = stroke.rect?.max?.x - stroke.rect?.min?.x
      const h = stroke.rect?.max?.y - stroke.rect?.min?.y
      if (!(w > 0 && h > 0)) problems.push(`${stroke.kind} ${stroke.id} has invalid bounds`)
    }
  }

  return {
    counts,
    brushKinds,
    shapeStyles,
    shapes,
    layers,
    problems,
    total: snapshot.store.strokes.length
  }
}

function readSnapshot(file: string) {
  const bytes = readFileSync(file)
  const text = (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString('utf8')
  const parsed = JSON.parse(text)
  return parsed.data?.engine_snapshot ?? parsed.data ?? parsed
}

function stable(value: any): any {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
  }
  return value
}

function expectEqual(name: string, expected: any, actual: any, failures: string[]) {
  const a = JSON.stringify(stable(expected))
  const b = JSON.stringify(stable(actual))
  if (a !== b) failures.push(`${name}: expected ${a}, got ${b}`)
}

function runSyntheticTests(): string[] {
  const failures: string[] = []
  const versioned = (value: any) => ({ value, version: 0 })
  const pos = (x: number, y: number, pressure = 0.5) => ({ pos: { x, y }, pressure })
  const smooth = (overrides: any = {}) => ({
    stroke_width: 10,
    stroke_color: { r: 0, g: 0, b: 0, a: 1 },
    pressure_curve: 'linear',
    line_cap: 'rounded',
    line_style: 'solid',
    ...overrides
  })
  const brush = (path: any, style: any, id: number) => ({ id, brushstroke: { path, style } })
  const lineBrush = brush(
    { start: pos(0, 0, 0.2), segments: [{ lineto: { end: pos(10, 0, 0.8) } }] },
    { smooth: smooth() },
    1
  )
  const quadBrush = brush(
    { start: pos(0, 0, 0.1), segments: [{ quadbezto: { cp: pos(5, 10, 0.5), end: pos(10, 0, 0.9) } }] },
    { smooth: smooth() },
    2
  )
  const cubicBrush = brush(
    {
      start: pos(0, 0, 0.1),
      segments: [{ cubbezto: { cp1: pos(3, 10, 0.4), cp2: pos(7, -10, 0.6), end: pos(10, 0, 0.9) } }]
    },
    { smooth: smooth() },
    3
  )
  const markerBrush = brush(
    { start: pos(0, 0, 0.5), segments: [{ lineto: { end: pos(10, 0, 0.5) } }] },
    { smooth: smooth({ stroke_width: 25, pressure_curve: 'const', stroke_color: { r: 0.87, g: 0.87, b: 0.85, a: 1 } }) },
    4
  )
  const texturedBrush = brush(
    { start: pos(0, 0, 0.5), segments: [{ lineto: { end: pos(10, 0, 0.5) } }] },
    { textured: { seed: 1, stroke_width: 10, stroke_color: { r: 0, g: 0, b: 0, a: 1 }, density: 2, distribution: 'uniform', pressure_curve: 'const' } },
    5
  )

  const shapeStroke = (shape: any, style: any, id: number) => ({ id, shapestroke: { shape, style } })
  const shapeStyles = { smooth: smooth({ stroke_width: 2 }) }
  const shapes = [
    shapeStroke({ line: { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } } }, shapeStyles, 1),
    shapeStroke({ arrow: { start: { x: 0, y: 0 }, tip: { x: 10, y: 0 } } }, shapeStyles, 2),
    shapeStroke({ rect: { cuboid: { half_extents: { x: 5, y: 3 } }, affine: [1, 0, 0, 1, 10, 10] } }, shapeStyles, 3),
    shapeStroke({ ellipse: { radii: { x: 5, y: 3 }, affine: [1, 0, 0, 1, 30, 10] } }, shapeStyles, 4),
    shapeStroke({ quadbez: { start: { x: 0, y: 0 }, cp: { x: 5, y: 10 }, end: { x: 10, y: 0 } } }, shapeStyles, 5),
    shapeStroke({ cubbez: { start: { x: 0, y: 0 }, cp1: { x: 3, y: 10 }, cp2: { x: 7, y: -10 }, end: { x: 10, y: 0 } } }, shapeStyles, 6),
    shapeStroke({ polyline: { start: { x: 0, y: 0 }, path: [{ x: 5, y: 5 }, { x: 10, y: 0 }] } }, shapeStyles, 7),
    shapeStroke({ polygon: { start: { x: 0, y: 0 }, path: [{ x: 5, y: 5 }, { x: 10, y: 0 }] } }, shapeStyles, 8),
    shapeStroke(
      { rect: { cuboid: { half_extents: { x: 5, y: 3 } }, affine: [1, 0, 0, 1, 40, 40] } },
      { rough: { stroke_color: { r: 0, g: 0, b: 0, a: 1 }, stroke_width: 2, fill_color: null, fill_style: 'Hachure', hachure_angle: -41, seed: 7 } },
      9
    )
  ]
  const vector = {
    id: 1,
    vectorimage: {
      svg_data: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
      intrinsic_size: [10, 10],
      rectangle: { cuboid: { half_extents: [5, 5] }, affine: [2, 0, 0, 2, 20, 20] }
    }
  }

  const strokeComponents = [lineBrush, quadBrush, cubicBrush, markerBrush, texturedBrush, ...shapes, vector]
  const layers = ['user_layer', 'user_layer', 'user_layer', 'highlighter', 'user_layer', ...shapes.map(() => 'user_layer'), 'document']
  const snapshot = {
    stroke_components: strokeComponents.map(versioned),
    chrono_components: strokeComponents.map((_, i) => versioned({ t: i, layer: layers[i] }))
  }
  const mapped = mapDesktopSnapshot(snapshot)
  const stats = mappedStats(mapped)
  expectEqual('synthetic counts', { brush: 5, shape: 9, vector: 1 }, {
    brush: stats.counts.brush ?? 0,
    shape: stats.counts.shape ?? 0,
    vector: stats.counts.vector ?? 0
  }, failures)
  failures.push(...stats.problems)

  const brushes = mapped.store.strokes.filter((s: any) => s.kind === 'brush')
  const byId = new Map(brushes.map((s: any) => [s.id, s]))
  const line = byId.get(1)
  if (line?.elements?.length !== 2 || line.elements[1].pressure !== 0.8) failures.push('modern lineto pressure mapping failed')
  const quad = byId.get(2)
  if (quad?.elements?.length !== 7 || quad.elements.at(-1).pressure !== 0.9 || Math.abs(quad.elements[3].pressure - 0.5) > 1e-9) {
    failures.push('modern quadbez pressure interpolation failed')
  }
  const cubic = byId.get(3)
  if (cubic?.elements?.length !== 9 || cubic.elements.at(-1).pressure !== 0.9 || Math.abs(cubic.elements[4].pressure - 0.5) > 1e-9) {
    failures.push('modern cubbez pressure interpolation failed')
  }
  const marker = byId.get(4)
  if (marker?.style_kind !== 'marker' || marker?.layer !== 'highlighter' || marker?.smooth?.pressure_curve !== 'const') {
    failures.push('marker chrono layer / constant-pressure mapping failed')
  }
  const textured = byId.get(5)
  if (textured?.style_kind !== 'textured' || textured?.textured?.density !== 2) failures.push('textured options mapping failed')

  const shapeKinds = mapped.store.strokes.filter((s: any) => s.kind === 'shape').flatMap((s: any) => s.shapes.map((q: any) => q.kind))
  expectEqual(
    'all desktop shape tags',
    ['line', 'arrow', 'rectangle', 'ellipse', 'quadbez', 'cubbez', 'polyline', 'polygon', 'rectangle'],
    shapeKinds,
    failures
  )
  const roughShape = mapped.store.strokes.filter((s: any) => s.kind === 'shape').find((s: any) => s.rough_enabled)
  const expectedHachureRadians = (-41 * Math.PI) / 180
  if (!roughShape || roughShape?.rough?.fill_style !== 'solid' || Math.abs((roughShape?.rough?.hachure_angle ?? 99) - expectedHachureRadians) > 1e-9) {
    failures.push('legacy rough Hachure alias / degree angle migration failed')
  }
  const vectorStroke = mapped.store.strokes.find((s: any) => s.kind === 'vector')
  if (vectorStroke?.layer !== 'document' || vectorStroke.rect.max.x - vectorStroke.rect.min.x !== 20) {
    failures.push('vectorimage affine bounds or document layer mapping failed')
  }
  return failures
}

const root = process.argv[2] ?? '../rnote-src/misc'
const files = walk(root).sort()
const warnings: string[] = []
const restore = installBrowserStubs(warnings)
let failed = false
const syntheticFailures = runSyntheticTests()
if (syntheticFailures.length) {
  failed = true
  console.log('FAIL synthetic desktop schema cases')
  for (const failure of syntheticFailures) console.log(`  - ${failure}`)
} else {
  console.log('PASS synthetic desktop schema cases (PenPath segments, all shapes, marker, vector)\n')
}

for (const file of files) {
  const failures: string[] = []
  const desktopSnapshot = readSnapshot(file)
  const raw = rawStats(desktopSnapshot)
  const mapped = mappedStats(mapDesktopSnapshot(desktopSnapshot))

  const expectedCounts = {
    brush: raw.counts.brushstroke ?? 0,
    shape: raw.counts.shapestroke ?? 0,
    text: raw.counts.textstroke ?? 0,
    vector: raw.counts.vectorimage ?? 0,
    bitmap: raw.counts.bitmapimage ?? 0
  }
  const actualCounts = {
    brush: mapped.counts.brush ?? 0,
    shape: mapped.counts.shape ?? 0,
    text: mapped.counts.text ?? 0,
    vector: mapped.counts.vector ?? 0,
    bitmap: mapped.counts.bitmap ?? 0
  }
  expectEqual('stroke counts', expectedCounts, actualCounts, failures)
  expectEqual('chrono layers', raw.layers, mapped.layers, failures)
  expectEqual(
    'brush styles',
    {
      smooth: (raw.brushStyles.smooth ?? 0),
      textured: raw.brushStyles.textured ?? 0
    },
    {
      smooth: (mapped.brushKinds.solid ?? 0) + (mapped.brushKinds.marker ?? 0),
      textured: mapped.brushKinds.textured ?? 0
    },
    failures
  )
  expectEqual(
    'shape styles',
    { rough: raw.shapeStyles.rough ?? 0, smooth: (raw.shapeStyles.smooth ?? 0) + (raw.shapeStyles.textured ?? 0) },
    { rough: mapped.shapeStyles.rough ?? 0, smooth: mapped.shapeStyles.smooth ?? 0 },
    failures
  )
  expectEqual('shape primitives', raw.shapes, mapped.shapes, failures)
  failures.push(...raw.problems, ...mapped.problems)

  const ok = raw.total === mapped.total && failures.length === 0
  if (!ok) failed = true
  const label = file.split('/').slice(-2).join('/')
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label} raw=${raw.total} mapped=${mapped.total}`)
  console.log(`  counts   expected ${JSON.stringify(expectedCounts)}`)
  console.log(`           actual   ${JSON.stringify(actualCounts)}`)
  console.log(`  layers   ${JSON.stringify(mapped.layers)}`)
  console.log(`  brushes  ${JSON.stringify(mapped.brushKinds)} raw=${JSON.stringify(raw.brushStyles)}`)
  if (Object.keys(raw.shapes).length) console.log(`  shapes   ${JSON.stringify(mapped.shapes)}`)
  for (const problem of failures) console.log(`  - ${problem}`)
}

restore()
if (warnings.length) {
  failed = true
  console.log(`\nMapper warnings (${warnings.length}):`)
  for (const warning of warnings.slice(0, 20)) console.log(`- ${warning}`)
  if (warnings.length > 20) console.log(`... ${warnings.length - 20} more`)
}
if (failed) process.exit(1)
console.log(`\nAll ${files.length} desktop .rnote samples passed structural import regression.`)
