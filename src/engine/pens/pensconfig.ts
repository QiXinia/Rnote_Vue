// Port of rnote-engine pens/pensconfig/*: per-tool configuration structs.

import { Color } from '../../compose/style/color'
import {
  SmoothOptions,
  MarkerOptions,
  TexturedOptions,
  RoughOptions,
  PressureCurve,
  LineCap,
  LineStyle
} from '../../compose/style/options'
import { TexturedDotsDistribution } from '../../compose/style/options'
import { PenPathBuilderType } from '../../compose/penpath/penpath'
import { ShapeBuilderType } from '../../compose/shapes/builders'
import { Constraints } from '../../compose/constraints'
import { TextAlignment } from '../strokes/textstroke'

export enum PenStyle {
  Brush = 'brush',
  Shaper = 'shaper',
  Typewriter = 'typewriter',
  Eraser = 'eraser',
  Selector = 'selector',
  Tools = 'tools'
}

export enum PenMode {
  Pen = 'pen',
  Eraser = 'eraser'
}

export enum BrushStyleKind {
  Marker = 'marker',
  Solid = 'solid',
  Textured = 'textured'
}

export class BrushConfig {
  style: BrushStyleKind = BrushStyleKind.Solid
  builderType: PenPathBuilderType = PenPathBuilderType.Curved
  solidOptions: SmoothOptions = new SmoothOptions()
  markerOptions: SmoothOptions = MarkerOptions.default()
  texturedOptions: TexturedOptions = new TexturedOptions()

  static STROKE_WIDTH_MIN = 0.1
  static STROKE_WIDTH_MAX = 500

  activeSmoothOptions(): SmoothOptions {
    return this.style === BrushStyleKind.Marker ? this.markerOptions : this.solidOptions
  }
  width(): number {
    return this.style === BrushStyleKind.Textured ? this.texturedOptions.stroke_width : this.activeSmoothOptions().stroke_width
  }
  setWidth(w: number) {
    if (this.style === BrushStyleKind.Textured) this.texturedOptions.stroke_width = w
    else this.activeSmoothOptions().stroke_width = w
  }
  color(): Color {
    return this.style === BrushStyleKind.Textured
      ? this.texturedOptions.stroke_color ?? Color.BLACK
      : this.activeSmoothOptions().stroke_color ?? Color.BLACK
  }
  setColor(c: Color) {
    if (this.style === BrushStyleKind.Textured) this.texturedOptions.stroke_color = c
    else this.activeSmoothOptions().stroke_color = c
  }
  newSeeds() {
    this.texturedOptions.seed = Math.floor(Math.random() * 2 ** 31)
    this.roughSeed()
  }
  roughSeed() {
    // rough lives on shaper; no-op kept for parity
  }

  clone(): BrushConfig {
    const c = new BrushConfig()
    c.style = this.style
    c.builderType = this.builderType
    c.solidOptions = this.solidOptions.clone()
    c.markerOptions = this.markerOptions.clone()
    c.texturedOptions = this.texturedOptions.clone()
    return c
  }

  toJSON() {
    return {
      style: this.style,
      builder_type: this.builderType,
      solid: this.solidOptions.toJSON(),
      marker: this.markerOptions.toJSON(),
      textured: this.texturedOptions.toJSON()
    }
  }
  static fromJSON(o: any): BrushConfig {
    const c = new BrushConfig()
    if (!o) return c
    c.style = o.style ?? BrushStyleKind.Solid
    c.builderType = o.builder_type ?? PenPathBuilderType.Curved
    c.solidOptions = SmoothOptions.fromJSON(o.solid)
    c.markerOptions = SmoothOptions.fromJSON(o.marker)
    if (!o.marker) {
      c.markerOptions.pressure_curve = PressureCurve.Const
      c.markerOptions.stroke_width = 12
    }
    c.texturedOptions = TexturedOptions.fromJSON(o.textured)
    return c
  }
}

export enum ShaperStyleKind {
  Smooth = 'smooth',
  Rough = 'rough'
}

export class ShaperConfig {
  builderType: ShapeBuilderType = ShapeBuilderType.Line
  style: ShaperStyleKind = ShaperStyleKind.Smooth
  smoothOptions: SmoothOptions = new SmoothOptions()
  roughOptions: RoughOptions = new RoughOptions()
  constraints: Constraints = Constraints.default()
  highlightMode = false
  highlightOpacity = 0.45

  static STROKE_WIDTH_MIN = 0.1
  static STROKE_WIDTH_MAX = 500

  width(): number {
    return this.style === ShaperStyleKind.Rough ? this.roughOptions.stroke_width : this.smoothOptions.stroke_width
  }
  setWidth(w: number) {
    this.smoothOptions.stroke_width = w
    this.roughOptions.stroke_width = w
  }
  color(): Color {
    return this.style === ShaperStyleKind.Rough
      ? this.roughOptions.stroke_color ?? Color.BLACK
      : this.smoothOptions.stroke_color ?? Color.BLACK
  }
  setColor(c: Color) {
    this.smoothOptions.stroke_color = c
    this.roughOptions.stroke_color = c
  }
  setFill(c: Color | null) {
    this.smoothOptions.fill_color = c
    this.roughOptions.fill_color = c
  }
  fill(): Color | null {
    return this.smoothOptions.fill_color
  }
  newSeeds() {
    this.roughOptions.seed = Math.floor(Math.random() * 2 ** 31)
  }
  clone(): ShaperConfig {
    const c = new ShaperConfig()
    c.builderType = this.builderType
    c.style = this.style
    c.smoothOptions = this.smoothOptions.clone()
    c.roughOptions = this.roughOptions.clone()
    c.constraints = this.constraints.clone()
    c.highlightMode = this.highlightMode
    c.highlightOpacity = this.highlightOpacity
    return c
  }
  toJSON() {
    return {
      builder_type: this.builderType,
      style: this.style,
      smooth: this.smoothOptions.toJSON(),
      rough: this.roughOptions.toJSON(),
      constraints: this.constraints.toJSON(),
      highlight_mode: this.highlightMode,
      highlight_opacity: this.highlightOpacity
    }
  }
  static fromJSON(o: any): ShaperConfig {
    const c = new ShaperConfig()
    if (!o) return c
    c.builderType = o.builder_type ?? ShapeBuilderType.Line
    c.style = o.style ?? ShaperStyleKind.Smooth
    c.smoothOptions = SmoothOptions.fromJSON(o.smooth)
    c.roughOptions = RoughOptions.fromJSON(o.rough)
    c.constraints = Constraints.fromJSON(o.constraints)
    c.highlightMode = o.highlight_mode ?? false
    c.highlightOpacity = o.highlight_opacity ?? 0.45
    return c
  }
}

export enum EraserStyle {
  TrashColliding = 'trash_colliding_strokes',
  SplitColliding = 'split_colliding_strokes'
}
export class EraserConfig {
  width = 12
  style: EraserStyle = EraserStyle.TrashColliding
  static WIDTH_MIN = 1
  static WIDTH_MAX = 500
  clone(): EraserConfig {
    const c = new EraserConfig()
    c.width = this.width
    c.style = this.style
    return c
  }
  toJSON() {
    return { width: this.width, style: this.style }
  }
  static fromJSON(o: any): EraserConfig {
    const c = new EraserConfig()
    if (!o) return c
    c.width = o.width ?? 12
    c.style = o.style ?? EraserStyle.TrashColliding
    return c
  }
}

export enum SelectorStyle {
  Polygon = 'polygon',
  Rectangle = 'rectangle',
  Single = 'single',
  IntersectingPath = 'intersectingpath'
}
export class SelectorConfig {
  style: SelectorStyle = SelectorStyle.Rectangle
  resizeLockAspectRatio = false
  clone(): SelectorConfig {
    const c = new SelectorConfig()
    c.style = this.style
    c.resizeLockAspectRatio = this.resizeLockAspectRatio
    return c
  }
  toJSON() {
    return { style: this.style, resize_lock_aspectratio: this.resizeLockAspectRatio }
  }
  static fromJSON(o: any): SelectorConfig {
    const c = new SelectorConfig()
    if (!o) return c
    c.style = o.style ?? SelectorStyle.Rectangle
    c.resizeLockAspectRatio = o.resize_lock_aspectratio ?? false
    return c
  }
}

export class TypewriterConfig {
  textWidth = 600
  family = 'serif'
  fontSize = 32
  weight = 500
  color: Color = Color.BLACK
  italic = false
  underline = false
  strike = false
  alignment: TextAlignment = TextAlignment.Start
  static TEXT_WIDTH_DEFAULT = 600
  clone(): TypewriterConfig {
    const c = new TypewriterConfig()
    Object.assign(c, { ...this, color: this.color.clone() })
    return c
  }
  toJSON() {
    return {
      text_width: this.textWidth,
      family: this.family,
      font_size: this.fontSize,
      weight: this.weight,
      color: this.color.toJSON(),
      italic: this.italic,
      underline: this.underline,
      strike: this.strike,
      alignment: this.alignment
    }
  }
  static fromJSON(o: any): TypewriterConfig {
    const c = new TypewriterConfig()
    if (!o) return c
    c.textWidth = o.text_width ?? 600
    c.family = o.family ?? 'serif'
    c.fontSize = o.font_size ?? 32
    c.weight = o.weight ?? 500
    c.color = o.color ? Color.fromJSON(o.color) : Color.BLACK
    c.italic = o.italic ?? false
    c.underline = o.underline ?? false
    c.strike = o.strike ?? false
    c.alignment = o.alignment ?? TextAlignment.Start
    return c
  }
}

export enum ToolsStyle {
  VerticalSpace = 'verticalspace',
  OffsetCamera = 'offsetcamera',
  Zoom = 'zoom',
  Laser = 'laser'
}
export class ToolsConfig {
  style: ToolsStyle = ToolsStyle.VerticalSpace
  verticalSpaceOffset = 0
  limitVerticalPageBorders = false
  limitHorizontalPageBorders = false
  clone(): ToolsConfig {
    const c = new ToolsConfig()
    c.style = this.style
    c.verticalSpaceOffset = this.verticalSpaceOffset
    c.limitVerticalPageBorders = this.limitVerticalPageBorders
    c.limitHorizontalPageBorders = this.limitHorizontalPageBorders
    return c
  }
  toJSON() {
    return {
      style: this.style,
      vertical_space_offset: this.verticalSpaceOffset,
      limit_vertical_page_borders: this.limitVerticalPageBorders,
      limit_horizontal_page_borders: this.limitHorizontalPageBorders
    }
  }
  static fromJSON(o: any): ToolsConfig {
    const c = new ToolsConfig()
    if (!o) return c
    c.style = o.style ?? ToolsStyle.VerticalSpace
    c.verticalSpaceOffset = o.vertical_space_offset ?? 0
    c.limitVerticalPageBorders = o.limit_vertical_page_borders ?? false
    c.limitHorizontalPageBorders = o.limit_horizontal_page_borders ?? false
    return c
  }
}

export class PensConfig {
  penModeStyle: PenStyle = PenStyle.Brush
  eraserModeStyle: PenStyle = PenStyle.Eraser
  brush = new BrushConfig()
  shaper = new ShaperConfig()
  typewriter = new TypewriterConfig()
  eraser = new EraserConfig()
  selector = new SelectorConfig()
  tools = new ToolsConfig()

  setAllStrokeColors(color: Color) {
    this.brush.markerOptions.stroke_color = color
    this.brush.solidOptions.stroke_color = color
    this.brush.texturedOptions.stroke_color = color
    this.shaper.smoothOptions.stroke_color = color
    this.shaper.roughOptions.stroke_color = color
    this.typewriter.color = color
  }

  setAllFillColors(color: Color) {
    this.brush.markerOptions.fill_color = color
    this.brush.solidOptions.fill_color = color
    this.shaper.smoothOptions.fill_color = color
    this.shaper.roughOptions.fill_color = color
  }

  clone(): PensConfig {
    const c = new PensConfig()
    c.penModeStyle = this.penModeStyle
    c.eraserModeStyle = this.eraserModeStyle
    c.brush = this.brush.clone()
    c.shaper = this.shaper.clone()
    c.typewriter = this.typewriter.clone()
    c.eraser = this.eraser.clone()
    c.selector = this.selector.clone()
    c.tools = this.tools.clone()
    return c
  }

  toJSON() {
    return {
      pen_mode_style: this.penModeStyle,
      eraser_mode_style: this.eraserModeStyle,
      brush: this.brush.toJSON(),
      shaper: this.shaper.toJSON(),
      typewriter: this.typewriter.toJSON(),
      eraser: this.eraser.toJSON(),
      selector: this.selector.toJSON(),
      tools: this.tools.toJSON()
    }
  }

  static fromJSON(o: any): PensConfig {
    const c = new PensConfig()
    if (!o) return c
    c.penModeStyle = o.pen_mode_style ?? PenStyle.Brush
    c.eraserModeStyle = o.eraser_mode_style ?? PenStyle.Eraser
    c.brush = BrushConfig.fromJSON(o.brush)
    c.shaper = ShaperConfig.fromJSON(o.shaper)
    c.typewriter = TypewriterConfig.fromJSON(o.typewriter)
    c.eraser = EraserConfig.fromJSON(o.eraser)
    c.selector = SelectorConfig.fromJSON(o.selector)
    c.tools = ToolsConfig.fromJSON(o.tools)
    return c
  }
}

export { PressureCurve, LineCap, LineStyle, TexturedDotsDistribution }
