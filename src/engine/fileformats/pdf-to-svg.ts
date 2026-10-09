// PDF -> SVG conversion for the "Vector" PDF import preference, porting the
// desktop's hayro_svg::convert path. We walk pdf.js's operator list and emit
// equivalent SVG paths / images / text inside a y-flipped coordinate group
// (PDF origin is bottom-left, SVG is top-left).
import * as pdfjsLib from 'pdfjs-dist'
import { Color } from '../../compose/style/color'

const OPS = pdfjsLib.OPS

interface GState {
  m: number[]
  fill: number[]
  stroke: number[]
  fillAlpha: number
  strokeAlpha: number
  lw: number
  cap: string
  join: string
  dash: number[]
  extraG: number
}
function defaultState(): GState {
  return {
    m: [1, 0, 0, 1, 0, 0],
    fill: [0, 0, 0],
    stroke: [0, 0, 0],
    fillAlpha: 1,
    strokeAlpha: 1,
    lw: 1,
    cap: 'butt',
    join: 'miter',
    dash: [],
    extraG: 0
  }
}

// PDF CTM right-multiply: M' = M * T, T = [a,b,c,d,e,f].
function mmul(M: number[], T: number[]): number[] {
  const [a, b, c, d, e, f] = T
  return [
    M[0] * a + M[2] * b,
    M[1] * a + M[3] * b,
    M[0] * c + M[2] * d,
    M[1] * c + M[3] * d,
    M[0] * e + M[2] * f + M[4],
    M[1] * e + M[3] * f + M[5]
  ]
}

function normalizeColor(args: number[]): number[] {
  if (!args || !args.length) return [0, 0, 0]
  if (args.length === 1) {
    const g = Math.round(args[0] * 255)
    return [g, g, g]
  }
  if (args.length === 4) {
    // CMYK -> RGB
    const [c, m, y, k] = args
    return [
      Math.round(255 * (1 - c) * (1 - k)),
      Math.round(255 * (1 - m) * (1 - k)),
      Math.round(255 * (1 - y) * (1 - k))
    ]
  }
  return args.slice(0, 3).map((v) => Math.round(v * 255))
}
function rgba(c: number[], a: number): string {
  return a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${round3(a)})`
}
function round3(v: number) {
  return Math.round(v * 1000) / 1000
}
function n(v: number) {
  return Math.round(v * 100) / 100
}

export async function convertPageToSvg(page: pdfjsLib.PDFPageProxy): Promise<string> {
  const opList = await page.getOperatorList()
  const vp = page.getViewport({ scale: 1 })
  const W = n(vp.width)
  const H = n(vp.height)

  const states: GState[] = [defaultState()]
  const cur = () => states[states.length - 1]
  let out = ''
  let d = ''
  const pendingImgs: { id: string; m: number[] }[] = []
  const textChunks: string[] = []

  function emitPath(mode: { fill?: boolean; stroke?: boolean; even?: boolean }) {
    if (!d) return
    const s = cur()
    const fill = mode.fill ? rgba(s.fill, s.fillAlpha) : 'none'
    const stroke = mode.stroke ? rgba(s.stroke, s.strokeAlpha) : 'none'
    const rule = mode.fill && mode.even ? ' fill-rule="evenodd"' : ''
    const dash = s.dash.length ? ` stroke-dasharray="${s.dash.map(n).join(' ')}"` : ''
    out +=
      `<path d="${d}" fill="${fill}"${rule} stroke="${stroke}" ` +
      `stroke-width="${n(s.lw)}" stroke-linecap="${s.cap}" stroke-linejoin="${s.join}"${dash}/>`
    d = ''
  }

  const fnArr = opList.fnArray
  const argsArr = opList.argsArray
  for (let i = 0; i < fnArr.length; i++) {
    const fn = fnArr[i]
    const a = argsArr[i]
    switch (fn) {
      case OPS.save:
        states.push({ ...cur(), extraG: 0 })
        out += '<g>'
        break
      case OPS.restore: {
        const s = cur()
        for (let g = 0; g < s.extraG; g++) out += '</g>'
        out += '</g>'
        states.pop()
        break
      }
      case OPS.transform:
        cur().m = mmul(cur().m, a)
        out += `<g transform="matrix(${a.map(n).join(',')})">`
        cur().extraG++
        break
      case OPS.moveTo:
        d += `M${n(a[0])} ${n(a[1])}`
        break
      case OPS.lineTo:
        d += `L${n(a[0])} ${n(a[1])}`
        break
      case OPS.curveTo:
        d += `C${n(a[0])} ${n(a[1])},${n(a[2])} ${n(a[3])},${n(a[4])} ${n(a[5])}`
        break
      case OPS.curveTo2:
        d += `Q${n(a[0])} ${n(a[1])},${n(a[2])} ${n(a[3])}`
        break
      case OPS.curveTo3:
        d += `T${n(a[0])} ${n(a[1])}`
        break
      case OPS.rectangle:
        d += `M${n(a[0])} ${n(a[1])}h${n(a[2])}v${n(a[3])}h${-n(a[2])}Z`
        break
      case OPS.closePath:
        d += 'Z'
        break
      case OPS.constructPath: {
        const bezier = a[0]
        const coords = a.slice(1)
        let ci = 0
        d += `M${n(coords[ci])} ${n(coords[ci + 1])}`
        ci += 2
        for (let b = 0; b < bezier; b++) {
          d += `C${n(coords[ci])} ${n(coords[ci + 1])},${n(coords[ci + 2])} ${n(coords[ci + 3])},${n(coords[ci + 4])} ${n(coords[ci + 5])}`
          ci += 6
        }
        while (ci < coords.length) {
          d += `L${n(coords[ci])} ${n(coords[ci + 1])}`
          ci += 2
        }
        break
      }
      case OPS.fill:
        emitPath({ fill: true })
        break
      case OPS.eoFill:
        emitPath({ fill: true, even: true })
        break
      case OPS.stroke:
        emitPath({ stroke: true })
        break
      case OPS.fillStroke:
        emitPath({ fill: true, stroke: true })
        break
      case OPS.eoFillStroke:
        emitPath({ fill: true, stroke: true, even: true })
        break
      case OPS.setFillColor:
      case OPS.setFillRGBColor:
      case OPS.setFillGray:
        cur().fill = normalizeColor(a)
        break
      case OPS.setStrokeColor:
      case OPS.setStrokeRGBColor:
      case OPS.setStrokeGray:
        cur().stroke = normalizeColor(a)
        break
      case OPS.setLineWidth:
        cur().lw = a[0]
        break
      case OPS.setLineCap:
        cur().cap = ['butt', 'round', 'square'][a[0]] || 'butt'
        break
      case OPS.setLineJoin:
        cur().join = ['miter', 'round', 'bevel'][a[0]] || 'miter'
        break
      case OPS.setDash:
        cur().dash = a[0] || []
        break
      case OPS.setGState: {
        const gs = a[0]
        if (gs) {
          if (typeof gs.ca === 'number') cur().fillAlpha = gs.ca
          if (typeof gs.CA === 'number') cur().strokeAlpha = gs.CA
        }
        break
      }
      case OPS.showText:
      case OPS.showSpacedText:
        textChunks.push(buildText(a, cur()))
        break
      case OPS.paintImageXObject: {
        const id = a[0]
        const key = pendingImgs.length
        pendingImgs.push({ id, m: [...cur().m] })
        out += `<!--IMG${key}-->`
        break
      }
      default:
        break
    }
  }

  // Resolve raster images (asynchronously held by pdf.js).
  for (let k = 0; k < pendingImgs.length; k++) {
    const { id, m } = pendingImgs[k]
    let imgXml = ''
    try {
      const img = await page.objs.get(id)
      const dataUrl = imageToDataUrl(img)
      if (dataUrl) {
        imgXml =
          `<g transform="matrix(${m.map(n).join(',')})">` +
          `<image x="0" y="-1" width="1" height="1" preserveAspectRatio="none" href="${dataUrl}"/></g>`
      }
    } catch {
      /* unresolved image */
    }
    out = out.replace(`<!--IMG${k}-->`, imgXml)
  }

  const textXml = textChunks.filter(Boolean).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>` +
    `<g transform="matrix(1,0,0,-1,0,${H})">${out}${textXml}</g></svg>`
  )
}

function buildText(glyphs: any, s: GState): string {
  if (!Array.isArray(glyphs) || !glyphs.length) return ''
  let xml = ''
  for (const g of glyphs) {
    const uni = g.unicode ?? g.originalChar
    if (!uni || uni === ' ') continue
    const m = g.matrix
    if (!m) continue
    const ch = String(uni)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    // glyph matrix is in y-up text space; flip text upright for the outer flip.
    xml +=
      `<g transform="matrix(${m.map(n).join(',')}) scale(1,-1)">` +
      `<text x="0" y="0" font-size="1" fill="${rgba(s.fill, s.fillAlpha)}">${ch}</text></g>`
  }
  return xml
}

function imageToDataUrl(img: any): string | null {
  try {
    if (!img) return null
    if (img instanceof HTMLCanvasElement) return img.toDataURL('image/png')
    if (typeof HTMLCanvasElement !== 'undefined' && img instanceof ImageBitmap) {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      c.getContext('2d')!.drawImage(img, 0, 0)
      return c.toDataURL('image/png')
    }
    if (img && img.bitmap) return imageToDataUrl(img.bitmap)
    return null
  } catch {
    return null
  }
}

// Re-export for callers that build Color from the generated SVG.
export { Color }
