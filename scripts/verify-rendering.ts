import assert from 'node:assert/strict'
import { Vec2 } from '../src/compose/geometry'
import {
  ArrowHeadStyle,
  ArrowShape,
  QuadBezShape
} from '../src/compose/shapes/shape'
import {
  RoughOptions,
  SmoothOptions
} from '../src/compose/style/options'
import { ShapeStroke } from '../src/engine/strokes/shapestroke'
import { applyDocumentTransform } from '../src/engine/render/renderer'

const smooth = SmoothOptions.default()
smooth.stroke_width = 4
const rough = new RoughOptions()
rough.stroke_width = 6
rough.seed = 42
const smoothStyle = { stroke: smooth, rough, roughEnabled: false }
const roughStyle = { stroke: smooth, rough, roughEnabled: true }

// Native rnote Arrow::to_kurbo is a stem plus an open 13π/16 chevron.
const arrow = new ArrowShape(new Vec2(10, 20), new Vec2(110, 20))
assert.equal(arrow.head, ArrowHeadStyle.Open)
const smoothSvg = arrow.toSVG(smoothStyle)
assert.match(smoothSvg, /<polyline/)
assert.doesNotMatch(smoothSvg, /<polygon/)
const roughSvg = arrow.toSVG(roughStyle)
assert.match(roughSvg, /<path/)
assert.doesNotMatch(roughSvg, /<polygon/)

// All shape variants, including Béziers and arrows, must enter the rough path.
const quad = new QuadBezShape(new Vec2(0, 0), new Vec2(50, 100), new Vec2(100, 0))
assert.match(quad.toSVG(roughStyle), /^<g>/)
assert.notEqual(quad.toSVG(roughStyle), quad.toSVG(smoothStyle))

// Rough Composer bounds are skeleton + half stroke + fixed 20 document units.
const stroke = new ShapeStroke([quad], { smooth, rough, roughEnabled: true })
const geometric = quad.bounds()
const bounds = stroke.bounds()
const expectedMargin = rough.stroke_width * 0.5 + RoughOptions.ROUGH_BOUNDS_MARGIN
assert.ok(bounds.min.x <= geometric.min.x - expectedMargin)
assert.ok(bounds.max.x >= geometric.max.x + expectedMargin)

// Cached selection passes must restore DPR, camera offset and zoom before they
// render document-space geometry/chrome.
const calls: unknown[][] = []
const ctx = {
  setTransform: (...args: unknown[]) => calls.push(['setTransform', ...args]),
  translate: (...args: unknown[]) => calls.push(['translate', ...args]),
  scale: (...args: unknown[]) => calls.push(['scale', ...args])
}
applyDocumentTransform(ctx, { offset: new Vec2(37, -12), zoom: 1.75 }, 2)
assert.deepEqual(calls, [
  ['setTransform', 2, 0, 0, 2, 0, 0],
  ['translate', -37, 12],
  ['scale', 1.75, 1.75]
])

console.log('Rendering regression checks passed')
