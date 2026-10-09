// Port of rnote-engine strokes/textstroke.rs. Rich text is authored in an
// overlay contenteditable and stored as HTML; a small layout engine wraps and
// draws it to canvas (so PNG/SVG export shares one representation).

import { Vec2, Aabb, Transform } from '../../compose/geometry'
import { Color } from '../../compose/style/color'
import { StrokeLayer } from '../../compose/style/options'
import { cssFamily } from '../../compose/style/fonts'
import type { Stroke, StrokeHitContext, StrokeJSON } from './stroke'
import { nextStrokeId } from './next-id'

export enum TextAlignment {
  Start = 'start',
  Center = 'center',
  End = 'end',
  Fill = 'fill'
}

export interface RunStyle {
  family: string
  size: number
  color: Color
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  weight: number
}

interface Word {
  text: string
  style: RunStyle
  space: boolean
}
interface Paragraph {
  alignment: TextAlignment
  words: Word[]
}
interface LaidLine {
  x: number
  y: number
  width: number
  height: number
  runs: { text: string; style: RunStyle; width: number }[]
  alignment: TextAlignment
}

export class TextStyle {
  family = 'serif'
  size = 32
  weight = 500
  color: Color = Color.BLACK
  italic = false
  underline = false
  strike = false
  alignment = TextAlignment.Start

  static FONT_FAMILY_DEFAULT = 'serif'
  static FONT_SIZE_DEFAULT = 32
  static FONT_WEIGHT_DEFAULT = 500

  clone(): TextStyle {
    const t = new TextStyle()
    t.family = this.family
    t.size = this.size
    t.weight = this.weight
    t.color = this.color.clone()
    t.italic = this.italic
    t.underline = this.underline
    t.strike = this.strike
    t.alignment = this.alignment
    return t
  }
}

export class TextStroke implements Stroke {
  kind = 'text' as const
  id: number
  // local-space text box: top-left at (0,0), width in px
  width: number
  html: string
  textStyle: TextStyle
  translation: Vec2
  rotation = 0
  scale = 1
  layer = StrokeLayer.UserLayer
  private cachedHeight = 0
  private cacheKey = ''

  constructor(html: string, translation: Vec2, width: number, style: TextStyle, id?: number) {
    this.id = id ?? nextStrokeId()
    this.html = html
    this.translation = translation
    this.width = width
    this.textStyle = style
  }

  get text(): string {
    return htmlToPlain(this.html)
  }

  isEmpty(): boolean {
    return this.text.trim().length === 0
  }

  localBounds(): Aabb {
    const h = Math.max(this.measureHeight(), this.textStyle.size * 1.2)
    return new Aabb(new Vec2(0, 0), new Vec2(this.width, h))
  }

  bounds(): Aabb {
    const t = this.docTransform()
    return this.localBounds().transform(t)
  }

  docTransform(): Transform {
    return Transform.newTranslateRotateScale(this.translation, this.rotation, new Vec2(this.scale, this.scale))
  }

  draw(ctx: CanvasRenderingContext2D) {
    const paragraphs = this.parse()
    ctx.save()
    const t = this.docTransform()
    ctx.transform(t.a, t.b, t.c, t.d, t.e, t.f)
    let y = 0
    for (const p of paragraphs) {
      const lines = this.layoutParagraph(ctx, p, y)
      for (const line of lines) this.drawLine(ctx, line)
      y += lines.reduce((m, l) => Math.max(m, l.height), this.textStyle.size * 1.2)
    }
    this.cachedHeight = y
    ctx.restore()
  }

  private drawLine(ctx: CanvasRenderingContext2D, line: LaidLine) {
    let x = line.x
    ctx.textBaseline = 'alphabetic'
    for (const run of line.runs) {
      const s = run.style
      ctx.font = `${s.italic ? 'italic ' : ''}${s.bold ? 'bold ' : ''}${s.weight} ${s.size}px ${cssFamily(s.family)}`
      ctx.fillStyle = s.color.toCss()
      ctx.textAlign = 'left'
      const baseline = line.y + s.size * 0.9
      ctx.fillText(run.text, x, baseline)
      if (s.underline || s.strike) {
        ctx.strokeStyle = s.color.toCss()
        ctx.lineWidth = Math.max(1, s.size / 18)
        ctx.beginPath()
        if (s.underline) {
          ctx.moveTo(x, baseline + s.size / 12)
          ctx.lineTo(x + run.width, baseline + s.size / 12)
        }
        if (s.strike) {
          ctx.moveTo(x, baseline - s.size * 0.35)
          ctx.lineTo(x + run.width, baseline - s.size * 0.35)
        }
        ctx.stroke()
      }
      x += run.width
    }
  }

  private parse(): Paragraph[] {
    const defaultStyle: RunStyle = {
      family: this.textStyle.family,
      size: this.textStyle.size,
      color: this.textStyle.color.clone(),
      bold: this.textStyle.weight >= 600,
      italic: this.textStyle.italic,
      underline: this.textStyle.underline,
      strike: this.textStyle.strike,
      weight: this.textStyle.weight
    }
    const container = document.createElement('div')
    container.innerHTML = this.html || '<br>'
    const paragraphs: Paragraph[] = []
    const pushBlock = (el: Element, alignment: TextAlignment) => {
      const words: Word[] = []
      const walk = (node: Node, style: RunStyle) => {
        node.childNodes.forEach((child) => {
          if (child.nodeType === 3) {
            // text node -> split into whitespace-delimited words
            const text = child.textContent ?? ''
            const tokens = text.split(/(\s+)/)
            for (const tok of tokens) {
              if (tok.length === 0) continue
              if (/^\s+$/.test(tok)) {
                if (words.length) words[words.length - 1].space = true
              } else {
                words.push({ text: tok, style: { ...style }, space: false })
              }
            }
          } else if (child.nodeType === 1) {
            const el = child as HTMLElement
            const ns = { ...style }
            const tag = el.tagName.toLowerCase()
            if (tag === 'b' || tag === 'strong') ns.bold = true
            if (tag === 'i' || tag === 'em') ns.italic = true
            if (tag === 'u') ns.underline = true
            if (tag === 's' || tag === 'del' || tag === 'strike') ns.strike = true
            const css = el.style
            if (css.fontWeight) ns.bold = parseInt(css.fontWeight) >= 600 || css.fontWeight === 'bold'
            if (css.fontStyle === 'italic') ns.italic = true
            if (css.textDecoration && css.textDecoration.includes('underline')) ns.underline = true
            if (css.textDecoration && css.textDecoration.includes('line-through')) ns.strike = true
            if (css.fontFamily) ns.family = css.fontFamily.replace(/['"]/g, '')
            if (css.fontSize) ns.size = parseFloat(css.fontSize) || ns.size
            if (css.color) ns.color = Color.fromCss(css.color)
            if (tag === 'br') {
              if (words.length) words[words.length - 1].space = true
            }
            walk(child, ns)
          }
        })
      }
      walk(el, { ...defaultStyle })
      paragraphs.push({ alignment, words })
    }

    let hasBlock = false
    container.childNodes.forEach((node) => {
      if (node.nodeType === 1) {
        const el = node as HTMLElement
        const tag = el.tagName.toLowerCase()
        if (tag === 'div' || tag === 'p' || el.style.display === 'block') {
          hasBlock = true
          pushBlock(el, alignmentFrom(el, this.textStyle.alignment))
        }
      }
    })
    if (!hasBlock) pushBlock(container, this.textStyle.alignment)
    if (paragraphs.length === 0) paragraphs.push({ alignment: this.textStyle.alignment, words: [] })
    return paragraphs
  }

  private layoutParagraph(ctx: CanvasRenderingContext2D, p: Paragraph, yOffset: number): LaidLine[] {
    const lines: LaidLine[] = []
    let current: Word[] = []
    const measure = (words: Word[]) => {
      let w = 0
      ctx.textBaseline = 'alphabetic'
      words.forEach((word, i) => {
        const s = word.style
        ctx.font = `${s.italic ? 'italic ' : ''}${s.bold ? 'bold ' : ''}${s.weight} ${s.size}px ${cssFamily(s.family)}`
        w += ctx.measureText(word.text).width
        if (word.space && i < words.length - 1) w += ctx.measureText(' ').width
      })
      return w
    }
    const lineHeight = (words: Word[]) =>
      Math.max(this.textStyle.size * 1.2, ...words.map((w) => w.style.size * 1.2))

    const emit = (words: Word[]) => {
      const runs: LaidLine['runs'] = []
      let width = 0
      words.forEach((word, i) => {
        const s = word.style
        ctx.font = `${s.italic ? 'italic ' : ''}${s.bold ? 'bold ' : ''}${s.weight} ${s.size}px ${cssFamily(s.family)}`
        const tw = ctx.measureText(word.text).width
        runs.push({ text: word.text, style: s, width: tw })
        width += tw
        if (word.space && i < words.length - 1) {
          const sw = ctx.measureText(' ').width
          runs.push({ text: ' ', style: s, width: sw })
          width += sw
        }
      })
      const h = lineHeight(words)
      let x = 0
      if (p.alignment === TextAlignment.Center) x = (this.width - width) / 2
      else if (p.alignment === TextAlignment.End) x = this.width - width
      lines.push({ x: Math.max(0, x), y: yOffset, width, height: h, runs, alignment: p.alignment })
    }

    for (const word of p.words) {
      const trial = [...current, word]
      if (measure(trial) > this.width && current.length) {
        emit(current)
        yOffset += lineHeight(current)
        current = [word]
      } else {
        current = trial
      }
    }
    if (current.length || lines.length === 0) emit(current)
    return lines
  }

  measureHeight(): number {
    const key = `${this.html}|${this.width}|${this.scale}`
    if (key === this.cacheKey) return this.cachedHeight
    const measureCtx = getMeasureCtx()
    const paragraphs = this.parse()
    let y = 0
    for (const p of paragraphs) {
      const before = y
      this.layoutParagraph(measureCtx, p, y)
      const lines = this.layoutParagraph(measureCtx, p, before)
      y += lines.reduce((m, l) => Math.max(m, l.height), this.textStyle.size * 1.2)
    }
    this.cachedHeight = Math.max(y, this.textStyle.size * 1.2)
    this.cacheKey = key
    return this.cachedHeight
  }

  translate(d: Vec2) {
    this.translation = this.translation.add(d)
  }
  transform(t: Transform) {
    this.translation = t.transformPoint(this.translation)
    this.rotation += t.rotation
    const s = t.scale
    this.scale *= (s.x + s.y) / 2
  }

  hitTest(p: Vec2, _c: StrokeHitContext): boolean {
    return this.bounds().extend_by(6).contains(p)
  }
  intersectsAabb(box: Aabb): boolean {
    return box.intersects(this.bounds())
  }

  invertColors() {
    this.textStyle.color = this.textStyle.color.toInvertedBrightnessColor()
  }

  duplicate(): Stroke {
    const s = new TextStroke(this.html, this.translation.clone(), this.width, this.textStyle.clone())
    s.rotation = this.rotation
    s.scale = this.scale
    return s
  }

  toSVG(): string {
    const w = r(this.width)
    const h = r(this.localBounds().height())
    const x = r(this.translation.x)
    const y = r(this.translation.y)
    const rot = r((this.rotation * 180) / Math.PI)
    const content = this.html
      .replace(/<br>/g, '<br/>')
      .replace(/font-weight:\s*bold/g, 'font-weight:bold')
    const divStyle = `margin:0;width:${w}px;font-family:${cssFamily(this.textStyle.family)};font-size:${this.textStyle.size}px;color:${this.textStyle.color.toHex()};font-weight:${this.textStyle.weight};text-align:${mapAlign(this.textStyle.alignment)};`
    return `<g transform="rotate(${rot} ${x} ${y})"><foreignObject x="${x}" y="${y}" width="${w}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml" style="${divStyle}">${content}</div></foreignObject></g>`
  }

  toJSON(): StrokeJSON {
    return {
      id: this.id,
      kind: 'text',
      html: this.html,
      translation: { x: this.translation.x, y: this.translation.y },
      rotation: this.rotation,
      scale: this.scale,
      width: this.width,
      style: {
        family: this.textStyle.family,
        size: this.textStyle.size,
        weight: this.textStyle.weight,
        color: this.textStyle.color.toJSON(),
        italic: this.textStyle.italic,
        underline: this.textStyle.underline,
        strike: this.textStyle.strike,
        alignment: this.textStyle.alignment
      }
    }
  }

  static fromJSON(o: any): TextStroke {
    const st = new TextStyle()
    if (o.style) {
      st.family = o.style.family ?? 'serif'
      st.size = o.style.size ?? 32
      st.weight = o.style.weight ?? 500
      st.color = o.style.color ? Color.fromJSON(o.style.color) : Color.BLACK
      st.italic = o.style.italic ?? false
      st.underline = o.style.underline ?? false
      st.strike = o.style.strike ?? false
      st.alignment = o.style.alignment ?? TextAlignment.Start
    }
    const t = new TextStroke(
      o.html ?? '',
      new Vec2(o.translation?.x ?? 0, o.translation?.y ?? 0),
      o.width ?? 600,
      st,
      o.id
    )
    t.rotation = o.rotation ?? 0
    t.scale = o.scale ?? 1
    return t
  }
}

let _measureCtx: CanvasRenderingContext2D | null = null
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!_measureCtx) {
    _measureCtx = document.createElement('canvas').getContext('2d')!
  }
  return _measureCtx
}

function alignmentFrom(el: HTMLElement, fallback: TextAlignment): TextAlignment {
  const a = el.style.textAlign
  if (a === 'center') return TextAlignment.Center
  if (a === 'end' || a === 'right') return TextAlignment.End
  if (a === 'justify' || a === 'fill') return TextAlignment.Fill
  if (a === 'start' || a === 'left') return TextAlignment.Start
  return fallback
}
function mapAlign(a: TextAlignment): string {
  return a === TextAlignment.Center ? 'center' : a === TextAlignment.End ? 'right' : a === TextAlignment.Fill ? 'justify' : 'left'
}
function htmlToPlain(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent ?? ''
}
function r(v: number): number {
  return Math.round(v * 100) / 100
}
