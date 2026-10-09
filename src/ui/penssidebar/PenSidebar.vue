<script setup lang="ts">
import { computed, defineComponent, h } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../../stores/app'
import {
  PenStyle,
  BrushStyleKind,
  ShaperStyleKind,
  EraserStyle,
  SelectorStyle,
  ToolsStyle,
  TypewriterConfig
} from '../../engine/pens/pensconfig'
import {
  PressureCurve,
  TexturedDotsDistribution,
  LineCap,
  LineStyle,
  FillStyle
} from '../../compose/style/options'
import { PenPathBuilderType } from '../../compose/penpath/penpath'
import { ShapeBuilderType } from '../../compose/shapes/builders'
import { ConstraintRatio } from '../../compose/constraints'
import { TextAlignment } from '../../engine/strokes/textstroke'
import RnoteIcon from '../icons/RnoteIcon.vue'
import Popover from '../menus/Popover.vue'
import RnSelect from '../widgets/RnSelect.vue'
import RnNumberInput from '../widgets/RnNumberInput.vue'
import RnSwitch from '../widgets/RnSwitch.vue'
import RnCheckbox from '../widgets/RnCheckbox.vue'

const store = useAppStore()
const { t } = useI18n()
const e = computed(() => store.engine!)
const tick = computed(() => store.uiTick)
const pressureCurveOptions = [
  { value: PressureCurve.Const, label: 'Constant' },
  { value: PressureCurve.Linear, label: 'Linear' },
  { value: PressureCurve.Sqrt, label: 'Square root' },
  { value: PressureCurve.Cbrt, label: 'Cubic root' },
  { value: PressureCurve.Pow2, label: 'Quadratic Parabola' },
  { value: PressureCurve.Pow3, label: 'Cubic Parabola' }
]

const pen = computed(() => {
  void tick.value
  return e.value.currentPen
})
const brush = computed(() => e.value.pensConfig.brush)
const shaper = computed(() => e.value.pensConfig.shaper)
const typewriter = computed(() => e.value.pensConfig.typewriter)
const eraser = computed(() => e.value.pensConfig.eraser)
const selector = computed(() => e.value.pensConfig.selector)
const tools = computed(() => e.value.pensConfig.tools)

const activeCss = computed(() => {
  void tick.value
  return e.value.activeColor().toCss()
})
const activeWidth = computed(() => {
  void tick.value
  return e.value.activeWidth()
})
function setWidth(w: number) {
  e.value.setActiveWidth(w)
}
function changed() {
  e.value.notify()
}
function resetTypewriter() {
  e.value.pensConfig.typewriter = new TypewriterConfig()
  changed()
}

const brushStyleIcon = computed(() => {
  switch (brush.value.style) {
    case BrushStyleKind.Marker:
      return 'brush-marker'
    case BrushStyleKind.Textured:
      return 'brush-textured'
    default:
      return 'brush-solid'
  }
})
const shapeIcon = computed(() => builderIcon(shaper.value.builderType))
function builderIcon(type: ShapeBuilderType) {
  const map: Record<ShapeBuilderType, string> = {
    [ShapeBuilderType.Line]: 'shape-line',
    [ShapeBuilderType.Arrow]: 'shape-arrow',
    [ShapeBuilderType.Rectangle]: 'shape-rectangle',
    [ShapeBuilderType.Grid]: 'shape-grid',
    [ShapeBuilderType.CoordSystem2D]: 'shape-coordsystem2d',
    [ShapeBuilderType.CoordSystem3D]: 'shape-coordsystem3d',
    [ShapeBuilderType.QuadrantCoordSystem2D]: 'shape-quadrantcoordsystem2d',
    [ShapeBuilderType.Ellipse]: 'shape-ellipse',
    [ShapeBuilderType.FociEllipse]: 'shape-fociellipse',
    [ShapeBuilderType.QuadBez]: 'shape-quadbez',
    [ShapeBuilderType.CubBez]: 'shape-cubbez',
    [ShapeBuilderType.Polyline]: 'shape-polyline',
    [ShapeBuilderType.Polygon]: 'shape-polygon'
  }
  return map[type] ?? 'shape-line'
}

const shapeGroups: { name: string; items: { type: ShapeBuilderType; label: string }[] }[] = [
  {
    name: 'Miscellaneous',
    items: [
      { type: ShapeBuilderType.Line, label: 'Line' },
      { type: ShapeBuilderType.Arrow, label: 'Arrow' },
      { type: ShapeBuilderType.Rectangle, label: 'Rectangle' },
      { type: ShapeBuilderType.Grid, label: 'Grid' }
    ]
  },
  {
    name: 'Coordinate Systems',
    items: [
      { type: ShapeBuilderType.CoordSystem2D, label: '2D coordinate system' },
      { type: ShapeBuilderType.CoordSystem3D, label: '3D coordinate system' },
      { type: ShapeBuilderType.QuadrantCoordSystem2D, label: '2D single quadrant coordinate system' }
    ]
  },
  {
    name: 'Ellipses',
    items: [
      { type: ShapeBuilderType.Ellipse, label: 'Ellipse' },
      { type: ShapeBuilderType.FociEllipse, label: 'Ellipse with foci' }
    ]
  },
  {
    name: 'Curves & Paths',
    items: [
      { type: ShapeBuilderType.QuadBez, label: 'Quadratic bezier curve' },
      { type: ShapeBuilderType.CubBez, label: 'Cubic bezier curve' },
      { type: ShapeBuilderType.Polyline, label: 'Polyline' },
      { type: ShapeBuilderType.Polygon, label: 'Polygon' }
    ]
  }
]

const fontFamilies = ['serif', 'system-ui', 'sans-serif', 'monospace', 'cursive', 'KaiTi', 'SimSun', 'Noto Sans CJK SC']
const emojiSets = ['😀', '🙂', '👍', '❤️', '✨', '★', '→', '✓', '✗']
function insertEmoji(s: string) {
  // The typewriter consumes the next text-insertion event; this is a lightweight
  // web equivalent of GTK's GtkEmojiChooser for the rail popover.
  navigator.clipboard?.writeText(s).catch(() => undefined)
  store.pushToast(`Emoji ${s} copied; paste it into the text box`)
}
const roughAngleDegrees = computed({
  get: () => Math.round((shaper.value.roughOptions.hachure_angle * 180) / Math.PI),
  set: (v: number) => {
    shaper.value.roughOptions.hachure_angle = (v * Math.PI) / 180
  }
})
function toggleRatio(ratio: ConstraintRatio) {
  const ratios = shaper.value.constraints.ratios
  if (ratios.has(ratio)) ratios.delete(ratio)
  else ratios.add(ratio)
  changed()
}
function setHighlightOpacity(v: string) {
  shaper.value.highlightOpacity = Number(v) / 100
  changed()
}
function selectBuilder(type: ShapeBuilderType, close: () => void) {
  shaper.value.builderType = type
  changed()
  close()
}

const clampSpin = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

const VerticalSpin = defineComponent({
  name: 'VerticalSpin',
  props: {
    value: { type: Number, required: true },
    min: { type: Number, default: 0.1 },
    max: { type: Number, default: 500 },
    step: { type: Number, default: 0.5 },
    digits: { type: Number, default: 1 },
    title: { type: String, default: 'Edit value' }
  },
  emits: ['update'],
  setup(props, ctx) {
    const update = (v: number) => ctx.emit('update', clampSpin(v, props.min, props.max))
    // Long-press auto-repeat, matching GTK spin buttons.
    let holdTimeout: ReturnType<typeof setTimeout> | null = null
    let repeatInterval: ReturnType<typeof setInterval> | null = null
    const clear = () => {
      if (holdTimeout) { clearTimeout(holdTimeout); holdTimeout = null }
      if (repeatInterval) { clearInterval(repeatInterval); repeatInterval = null }
    }
    const start = (dir: number) => {
      update(props.value + dir * props.step)
      clear()
      holdTimeout = setTimeout(() => {
        repeatInterval = setInterval(() => update(props.value + dir * props.step), 70)
      }, 450)
    }
    const down = (dir: number) => (e: PointerEvent) => { e.preventDefault(); start(dir) }
    return () =>
      h('div', { class: 'vertical-spin', title: t(props.title) }, [
        h('button', {
          class: 'spin-up', type: 'button', title: t('Increase'),
          onPointerdown: down(1), onPointerup: clear, onPointerleave: clear, onPointercancel: clear
        }, [h(RnoteIcon, { name: 'plus' })]),
        h('input', {
          class: 'spin-value',
          value: props.value.toFixed(props.digits),
          inputMode: 'numeric',
          onChange: (ev: Event) => {
            const v = Number((ev.target as HTMLInputElement).value)
            if (Number.isFinite(v)) update(v)
          }
        }),
        h('button', {
          class: 'spin-down', type: 'button', title: t('Decrease'),
          onPointerdown: down(-1), onPointerup: clear, onPointerleave: clear, onPointercancel: clear
        }, [h(RnoteIcon, { name: 'minus' })])
      ])
  }
})

const CompactWidth = defineComponent({
  name: 'CompactWidth',
  props: { width: Number, color: { type: String, default: 'currentColor' }, round: Boolean },
  emits: ['set-width'],
  setup(props, ctx) {
    const presets = [2, 8, 16]
    const previewSize = (w: number) => {
      if (props.round) {
        const half = (8 * w * 0.5) / (8 + w * 0.5)
        return half * 2
      }
      const radius = (11 * w) / (11 + w * 0.5)
      return radius * 2
    }
    return () =>
      h('div', { class: 'width-rail' }, [
        h(VerticalSpin, {
          value: props.width ?? 2,
          min: 0.1,
          max: 500,
          step: 0.5,
          digits: 1,
          title: t('Edit Stroke Size'),
          onUpdate: (v: number) => ctx.emit('set-width', v)
        }),
        h('div', { class: 'width-setters' }, presets.map((w) =>
          h(
            'button',
            {
              class: ['width-setter', { active: Math.abs((props.width ?? 0) - w) < 0.05 }],
              title: w.toFixed(1),
              onClick: () => ctx.emit('set-width', w)
            },
            [h('span', {
              class: props.round ? 'width-rect' : 'width-dot',
              style: { width: `${previewSize(w)}px`, height: `${previewSize(w)}px` }
            })]
          )
        ))
      ])
  }
})
</script>

<template>
  <aside v-if="e" class="pensidebar compact-sidebar overlay_toolbar_scrollable" aria-label="Pen options" :data-tick="tick">
    <template v-if="pen === PenStyle.Brush">
      <div class="rail-group">
        <Popover key="brush-style" align="right" button-class="rail-btn" :icon="brushStyleIcon">
          <template #default="{ close }">
            <div class="pop-header">
              <strong>{{ t('Brush Style') }}</strong>
              <button class="btn flat icon-btn pop-close" @click="close"><RnoteIcon name="close" /></button>
            </div>
            <div class="adw-list">
              <button class="adw-row" :class="{ active: brush.style === BrushStyleKind.Marker }" @click="(brush.style = BrushStyleKind.Marker), changed(), close()">
                <RnoteIcon class="row-icon" name="brush-marker" />
                <span class="row-text"><strong>{{ t('Marker') }}</strong><small>{{ t('Mark underneath other strokes') }}</small></span>
              </button>
              <button class="adw-row" :class="{ active: brush.style === BrushStyleKind.Solid }" @click="(brush.style = BrushStyleKind.Solid), changed(), close()">
                <RnoteIcon class="row-icon" name="brush-solid" />
                <span class="row-text"><strong>{{ t('Solid') }}</strong><small>{{ t('Draw solid color strokes') }}</small></span>
              </button>
              <button class="adw-row" :class="{ active: brush.style === BrushStyleKind.Textured }" @click="(brush.style = BrushStyleKind.Textured), changed(), close()">
                <RnoteIcon class="row-icon" name="brush-textured" />
                <span class="row-text"><strong>{{ t('Textured') }}</strong><small>{{ t('Draw textured strokes') }}</small></span>
              </button>
            </div>
          </template>
        </Popover>
        <Popover key="brush-config" align="right" button-class="rail-btn" icon="settings">
          <template #default="{ close }">
            <div class="pop-header">
              <strong>{{ t('Brush Configuration') }}</strong>
              <button class="btn flat icon-btn pop-close" @click="close"><RnoteIcon name="close" /></button>
            </div>
            <div class="pref-heading">{{ t('Path Modelling') }}</div>
            <div class="adw-list">
              <button class="adw-row no-prefix" :class="{ active: brush.builderType === PenPathBuilderType.Simple }" @click="(brush.builderType = PenPathBuilderType.Simple), changed()">
                <span class="row-text"><strong>{{ t('Simple') }}</strong><small>{{ t('Produces line segments from the raw input.\n') }}</small></span>
              </button>
              <button class="adw-row no-prefix" :class="{ active: brush.builderType === PenPathBuilderType.Curved }" @click="(brush.builderType = PenPathBuilderType.Curved), changed()">
                <span class="row-text"><strong>{{ t('Curved') }}</strong><small>{{ t('Produces smooth, curved segments.\n') }}</small></span>
              </button>
              <button class="adw-row no-prefix" :class="{ active: brush.builderType === PenPathBuilderType.Modeled }" @click="(brush.builderType = PenPathBuilderType.Modeled), changed()">
                <span class="row-text"><strong>{{ t('Modeled') }}</strong><small>{{ t('Produces a modeled path with physics based algorithms.\nResults in the best looking handwriting.') }}</small></span>
              </button>
            </div>
            <template v-if="brush.style !== BrushStyleKind.Textured">
              <div class="pref-heading">{{ t('Solid Style') }}</div>
              <div class="combo-row">
                <span>{{ t('Pressure Curve') }}<small>{{ t('Choose a pressure curve') }}</small></span>
                <RnSelect
                  :model-value="brush.solidOptions.pressure_curve"
                  :options="pressureCurveOptions.map((c) => ({ value: c.value, label: t(c.label) }))"
                  :width="150"
                  @update:model-value="(v: any) => { brush.solidOptions.pressure_curve = v; changed() }"
                />
              </div>
            </template>
            <template v-else>
              <div class="pref-heading">{{ t('Textured Style') }}</div>
              <div class="spin-row">
                <span>{{ t('Density') }}<small>{{ t('The density is the amount of dots per 10x10 area') }}</small></span>
                <RnNumberInput v-model="brush.texturedOptions.density" :min="0.1" :max="20" :step="0.1" :digits="1" :width="130" @update:model-value="changed" />
              </div>
              <div class="combo-row">
                <span>{{ t('Stroke Dots Position Distribution') }}<small>{{ t('Choose a dots position probability distribution') }}</small></span>
                <RnSelect
                  :model-value="brush.texturedOptions.distribution"
                  :width="150"
                  :options="[
                    { value: TexturedDotsDistribution.Uniform, label: t('dotDistribution.Uniform') },
                    { value: TexturedDotsDistribution.Normal, label: t('dotDistribution.Normal') },
                    { value: TexturedDotsDistribution.Exponential, label: t('dotDistribution.Exponential') },
                    { value: TexturedDotsDistribution.ReverseExponential, label: t('dotDistribution.Reverse Exponential') }
                  ]"
                  @update:model-value="(v: any) => { brush.texturedOptions.distribution = v; changed() }"
                />
              </div>
            </template>
          </template>
        </Popover>
      </div>
      <div class="v-sep"></div>
      <CompactWidth :width="activeWidth" :color="activeCss" @set-width="setWidth" />
    </template>

    <template v-else-if="pen === PenStyle.Shaper">
      <div class="rail-group">
        <Popover key="shaper-builders" align="right" button-class="rail-btn shaper-builders" :panel-width="262" :icon="shapeIcon">
          <template #default="{ close }">
            <div class="pop-header">
              <strong>{{ t('Shape Builders') }}</strong>
              <button class="btn flat icon-btn pop-close" @click="close"><RnoteIcon name="close" /></button>
            </div>
            <div class="grouped-icon-picker">
              <div v-for="group in shapeGroups" :key="group.name" class="icon-picker-group">
                <div class="group-name">{{ t(group.name) }}</div>
                <div class="icon-flow">
                  <button
                    v-for="item in group.items"
                    :key="item.type"
                    class="icon-tile"
                    :class="{ active: shaper.builderType === item.type }"
                    :title="t(item.label)"
                    @click="selectBuilder(item.type, close)"
                  ><RnoteIcon :name="builderIcon(item.type)" /></button>
                </div>
              </div>
            </div>
            <div class="selection-label">{{ t(shapeGroups.flatMap(g => g.items).find(i => i.type === shaper.builderType)?.label ?? '') }}</div>
          </template>
        </Popover>
        <Popover key="shaper-config" align="right" button-class="rail-btn" :panel-width="342" icon="settings">
          <template #default="{ close }">
            <div class="pop-header">
              <strong>{{ t('Shape Configuration') }}</strong>
              <button class="btn flat icon-btn pop-close" @click="close"><RnoteIcon name="close" /></button>
            </div>
            <div class="pref-heading">{{ t('Shaper Style') }}</div>
            <div class="adw-list">
              <button class="adw-row" :class="{ active: shaper.style === ShaperStyleKind.Smooth }" @click="(shaper.style = ShaperStyleKind.Smooth), changed()">
                <RnoteIcon class="row-icon" name="shaper-smooth" />
                <span class="row-text"><strong>{{ t('Smooth') }}</strong></span>
              </button>
              <button class="adw-row" :class="{ active: shaper.style === ShaperStyleKind.Rough }" @click="(shaper.style = ShaperStyleKind.Rough), changed()">
                <RnoteIcon class="row-icon" name="shaper-rough" />
                <span class="row-text"><strong>{{ t('Rough') }}</strong></span>
              </button>
            </div>
            <div class="pref-heading">{{ t('Highlighting') }}</div>
            <div class="switch-row">
              <span>{{ t('Highlight-Mode') }}<small>{{ t('Fade active color') }}</small></span>
              <RnSwitch :model-value="shaper.highlightMode" @update:model-value="(v: any) => { shaper.highlightMode = v; changed() }" />
            </div>
            <div class="spin-row">
              <span>{{ t('Highlight-Opacity') }}</span>
              <RnNumberInput
                :model-value="Math.round(shaper.highlightOpacity * 100)"
                :min="0"
                :max="100"
                :step="1"
                :digits="0"
                :width="130"
                suffix="%"
                @update:model-value="(v) => setHighlightOpacity(String(v))"
              />
            </div>
            <template v-if="shaper.style === ShaperStyleKind.Smooth">
              <div class="pref-heading">{{ t('Smooth Style') }}</div>
              <div class="combo-row">
                <span>{{ t('Line Cap') }}</span>
                <RnSelect
                  :model-value="shaper.smoothOptions.line_cap"
                  :width="150"
                  :options="[
                    { value: LineCap.Straight, label: t('Straight') },
                    { value: LineCap.Rounded, label: t('Round') }
                  ]"
                  @update:model-value="(v: any) => { shaper.smoothOptions.line_cap = v; changed() }"
                />
              </div>
              <div class="combo-row">
                <span>{{ t('Line Style') }}</span>
                <RnSelect
                  :model-value="shaper.smoothOptions.line_style"
                  :width="150"
                  :options="[
                    { value: LineStyle.Solid, label: t('Solid') },
                    { value: LineStyle.Dotted, label: t('Dotted') },
                    { value: LineStyle.DashedNarrow, label: t('Dashed (narrow)') },
                    { value: LineStyle.DashedEquidistant, label: t('Dashed (equidistant)') },
                    { value: LineStyle.DashedWide, label: t('Dashed (wide)') }
                  ]"
                  @update:model-value="(v: any) => { shaper.smoothOptions.line_style = v; changed() }"
                />
              </div>
            </template>
            <template v-else>
              <div class="pref-heading">{{ t('Rough Style') }}</div>
              <div class="combo-row">
                <span>{{ t('Fill Style') }}</span>
                <RnSelect
                  :model-value="shaper.roughOptions.fill_style"
                  :width="150"
                  :options="[
                    { value: FillStyle.Solid, label: t('Solid') },
                    { value: FillStyle.Hachure, label: t('Hachure') },
                    { value: FillStyle.ZigZag, label: t('Zig-Zag') },
                    { value: FillStyle.ZigZagLine, label: t('Zig-Zag Line') },
                    { value: FillStyle.Crosshatch, label: t('Crosshatch') },
                    { value: FillStyle.Dots, label: t('Dots') },
                    { value: FillStyle.Dashed, label: t('Dashed') }
                  ]"
                  @update:model-value="(v: any) => { shaper.roughOptions.fill_style = v; changed() }"
                />
              </div>
              <div class="spin-row">
                <span>{{ t('Hachure Angle') }}</span>
                <RnNumberInput v-model="roughAngleDegrees" :min="-180" :max="180" :step="1" :digits="0" :width="130" suffix="°" @update:model-value="changed" />
              </div>
            </template>
            <div class="pref-heading">{{ t('Constraints') }}</div>
            <div class="switch-row">
              <span>{{ t('Enabled') }}<small>{{ t('Hold Ctrl to temporarily enable/disable\nconstraints when this switch is off/on') }}</small></span>
              <RnSwitch :model-value="shaper.constraints.enabled" @update:model-value="(v: any) => { shaper.constraints.enabled = v; changed() }" />
            </div>
            <div class="check-row constraint-row">
              <RnCheckbox :model-value="shaper.constraints.ratios.has(ConstraintRatio.OneToOne)" @update:model-value="() => toggleRatio(ConstraintRatio.OneToOne)" />
              <span>1:1</span>
            </div>
            <div class="check-row constraint-row">
              <RnCheckbox :model-value="shaper.constraints.ratios.has(ConstraintRatio.ThreeToTwo)" @update:model-value="() => toggleRatio(ConstraintRatio.ThreeToTwo)" />
              <span>3:2</span>
            </div>
            <div class="check-row constraint-row">
              <RnCheckbox :model-value="shaper.constraints.ratios.has(ConstraintRatio.Golden)" @update:model-value="() => toggleRatio(ConstraintRatio.Golden)" />
              <span>{{ t('Golden Ratio (1:1.618)') }}</span>
            </div>
          </template>
        </Popover>
      </div>
      <div class="v-sep"></div>
      <CompactWidth :width="activeWidth" :color="activeCss" @set-width="setWidth" />
      <div class="v-sep"></div>
    </template>

    <template v-else-if="pen === PenStyle.Typewriter">
      <Popover align="right" button-class="rail-btn" icon="typewriter-font">
        <template #default="{ close }">
          <div class="pop-header">
            <strong>{{ t('Font Chooser') }}</strong>
            <button class="btn flat icon-btn pop-close" @click="close"><RnoteIcon name="close" /></button>
          </div>
          <div class="combo-row">
            <span>{{ t('Font Chooser') }}</span>
            <RnSelect
              :model-value="typewriter.family"
              :width="160"
              :options="fontFamilies.map((f) => ({ value: f, label: f }))"
              @update:model-value="(v: any) => { typewriter.family = v; changed() }"
            />
          </div>
          <div class="spin-row">
            <span>{{ t('Text Width') }}<small>{{ t('Width of new text boxes') }}</small></span>
            <RnNumberInput v-model="typewriter.textWidth" :min="80" :max="1200" :step="10" :digits="0" :width="140" @update:model-value="changed" />
          </div>
        </template>
      </Popover>
      <div class="v-sep"></div>
      <VerticalSpin
        :value="typewriter.fontSize"
        :min="8"
        :max="120"
        :step="1"
        :digits="0"
        title="Edit font size"
        @update="(v) => { typewriter.fontSize = v; changed() }"
      />
      <div class="v-sep"></div>
      <Popover align="right" button-class="rail-btn" :panel-width="232" icon="emoji">
        <template #default="{ close }">
          <div class="pop-header">
            <strong>{{ t('Pick And Insert Emoji') }}</strong>
            <button class="btn flat icon-btn pop-close" @click="close"><RnoteIcon name="close" /></button>
          </div>
          <div class="emoji-grid wide-emoji">
            <button v-for="s in emojiSets" :key="s" class="emoji-choice" @click="insertEmoji(s)">{{ s }}</button>
          </div>
        </template>
      </Popover>
      <div class="v-sep"></div>
      <div class="rail-group linked-rail">
        <button class="rail-btn" :title="t('Reset Text Attributes')" @click="resetTypewriter"><RnoteIcon name="reset" /></button>
        <button class="rail-btn" :class="{ active: typewriter.weight >= 700 }" :title="t('Bold')" @click="(typewriter.weight = typewriter.weight >= 700 ? 500 : 700), changed()"><RnoteIcon name="bold" /></button>
        <button class="rail-btn" :class="{ active: typewriter.italic }" :title="t('Italic')" @click="(typewriter.italic = !typewriter.italic), changed()"><RnoteIcon name="italic" /></button>
        <button class="rail-btn" :class="{ active: typewriter.underline }" :title="t('Underline')" @click="(typewriter.underline = !typewriter.underline), changed()"><RnoteIcon name="underline" /></button>
        <button class="rail-btn" :class="{ active: typewriter.strike }" :title="t('Strikethrough')" @click="(typewriter.strike = !typewriter.strike), changed()"><RnoteIcon name="strikethrough" /></button>
      </div>
      <div class="v-sep"></div>
      <div class="rail-group linked-rail">
        <button class="rail-btn" :class="{ active: typewriter.alignment === TextAlignment.Start }" :title="t('Align Left')" @click="(typewriter.alignment = TextAlignment.Start), changed()"><RnoteIcon name="align-start" /></button>
        <button class="rail-btn" :class="{ active: typewriter.alignment === TextAlignment.Center }" :title="t('Align Center')" @click="(typewriter.alignment = TextAlignment.Center), changed()"><RnoteIcon name="align-center" /></button>
        <button class="rail-btn" :class="{ active: typewriter.alignment === TextAlignment.End }" :title="t('Align Right')" @click="(typewriter.alignment = TextAlignment.End), changed()"><RnoteIcon name="align-end" /></button>
        <button class="rail-btn" :class="{ active: typewriter.alignment === TextAlignment.Fill }" :title="t('Fill')" @click="(typewriter.alignment = TextAlignment.Fill), changed()"><RnoteIcon name="align-fill" /></button>
      </div>
    </template>

    <template v-else-if="pen === PenStyle.Eraser">
      <div class="rail-group linked-rail">
        <button class="rail-btn" :class="{ active: eraser.style === EraserStyle.TrashColliding }" :title="t('Trash Strokes')" @click="(eraser.style = EraserStyle.TrashColliding), changed()"><RnoteIcon name="eraser-trash" /></button>
        <button class="rail-btn" :class="{ active: eraser.style === EraserStyle.SplitColliding }" :title="t('Split Strokes')" @click="(eraser.style = EraserStyle.SplitColliding), changed()"><RnoteIcon name="eraser-split" /></button>
      </div>
      <div class="v-sep"></div>
      <CompactWidth :width="activeWidth" color="#777" @set-width="setWidth" />
    </template>

    <template v-else-if="pen === PenStyle.Selector">
      <div class="rail-group linked-rail">
        <button class="rail-btn" :class="{ active: selector.style === SelectorStyle.Polygon }" :title="t('Select With a Polygon')" @click="(selector.style = SelectorStyle.Polygon), changed()"><RnoteIcon name="selector-polygon" /></button>
        <button class="rail-btn" :class="{ active: selector.style === SelectorStyle.Rectangle }" :title="t('Select With a Rectangle')" @click="(selector.style = SelectorStyle.Rectangle), changed()"><RnoteIcon name="selector-rectangle" /></button>
        <button class="rail-btn" :class="{ active: selector.style === SelectorStyle.Single }" :title="t('Select One by One')" @click="(selector.style = SelectorStyle.Single), changed()"><RnoteIcon name="selector-single" /></button>
        <button class="rail-btn" :class="{ active: selector.style === SelectorStyle.IntersectingPath }" :title="t('Select Intersecting Path')" @click="(selector.style = SelectorStyle.IntersectingPath), changed()"><RnoteIcon name="selector-path" /></button>
      </div>
      <div class="v-sep"></div>
      <div class="rail-group vertical-actions">
        <button class="rail-btn" :class="{ active: selector.resizeLockAspectRatio }" :title="t('Lock Aspect Ratio While Resizing the Selection')" @click="(selector.resizeLockAspectRatio = !selector.resizeLockAspectRatio), changed()"><RnoteIcon name="lock-aspect" /></button>
        <button class="rail-btn" :title="t('Select All Strokes')" @click="e.selectAll()"><RnoteIcon name="select-all" /></button>
        <button class="rail-btn" :title="t('Deselect All Strokes')" @click="e.deselectAll()"><RnoteIcon name="deselect-all" /></button>
        <button class="rail-btn" :title="t('Invert Color Brightness of All Selected Strokes')" @click="e.invertSelectedColors()"><RnoteIcon name="invert-color" /></button>
        <button class="rail-btn" :title="t('Duplicate Selection')" @click="e.duplicateSelected()"><RnoteIcon name="duplicate" /></button>
        <button class="rail-btn danger" :title="t('Delete Selection')" @click="e.removeSelected()"><RnoteIcon name="trash" /></button>
      </div>
    </template>

    <template v-else-if="pen === PenStyle.Tools">
      <div class="rail-group">
        <button class="rail-btn" :class="{ active: tools.style === ToolsStyle.VerticalSpace }" :title="t('Insert Vertical Space')" @click="(tools.style = ToolsStyle.VerticalSpace), changed()"><RnoteIcon name="tools-verticalspace" /></button>
        <Popover align="right" button-class="rail-btn" icon="settings">
          <template #default="{ close }">
            <div class="pop-header">
              <strong>{{ t('Vertical-Space Tool Configuration') }}</strong>
              <button class="btn flat icon-btn pop-close" @click="close"><RnoteIcon name="close" /></button>
            </div>
            <div class="switch-row">
              <span>{{ t('Limit movement to Vertical Page Borders') }}<small>{{ t('Only select elements that are inside or below the page selected, not ones on the left/right') }}</small></span>
              <RnSwitch v-model="tools.limitVerticalPageBorders" @update:model-value="changed" />
            </div>
            <div class="switch-row">
              <span>{{ t('Limit movement to Horizontal Page Borders') }}<small>{{ t('Only select elements between the current position and the next horizontal border below') }}</small></span>
              <RnSwitch v-model="tools.limitHorizontalPageBorders" @update:model-value="changed" />
            </div>
          </template>
        </Popover>
      </div>
      <div class="v-sep"></div>
      <button class="rail-btn" :class="{ active: tools.style === ToolsStyle.OffsetCamera }" :title="t('Move View')" @click="(tools.style = ToolsStyle.OffsetCamera), changed()"><RnoteIcon name="hand" /></button>
      <div class="v-sep"></div>
      <button class="rail-btn" :class="{ active: tools.style === ToolsStyle.Zoom }" :title="t('Zoom in/out')" @click="(tools.style = ToolsStyle.Zoom), changed()"><RnoteIcon name="tools-zoom" /></button>
      <div class="v-sep"></div>
      <button class="rail-btn" :class="{ active: tools.style === ToolsStyle.Laser }" :title="t('Laser')" @click="(tools.style = ToolsStyle.Laser), changed()"><RnoteIcon name="laser" /></button>
    </template>
  </aside>
</template>

<style scoped>
.compact-sidebar {
  width: 54px;
  min-height: 240px;
  max-height: 100%;
  height: fit-content;
  align-self: center;
  padding: 6px;
  gap: 6px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow-y: auto;
  overflow-x: hidden;
}
.rail-group { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.linked-rail .rail-btn { border-radius: 0; }
.linked-rail .rail-btn:first-child { border-radius: 8px 8px 0 0; }
.linked-rail .rail-btn:last-child { border-radius: 0 0 8px 8px; }
.vertical-actions { gap: 6px; }
.v-sep { width: 24px; min-height: 1px; background: var(--border); margin: 1px 0; }
.width-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.vertical-spin {
  width: 42px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--input-bg);
}
.vertical-spin button,
.vertical-spin input {
  width: 40px;
  min-height: 28px;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--fg);
  font-size: 13px;
  text-align: center;
  padding: 0;
}
.vertical-spin button {
  display: grid;
  place-items: center;
  touch-action: none;
  cursor: pointer;
}
.vertical-spin button svg {
  width: 15px;
  height: 15px;
}
.vertical-spin input { -moz-appearance: textfield; }
.vertical-spin input::-webkit-outer-spin-button,
.vertical-spin input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.vertical-spin button:last-child { border-bottom: 0; }
.vertical-spin button:hover { background: var(--button-flat-active); }
.width-setters {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.width-setter {
  width: 42px;
  height: 32px;
  padding: 0;
  display: grid;
  place-items: center;
  background: transparent;
  border: 0;
  border-radius: 6px;
}
.width-setter:hover,
.width-setter.active { background: var(--button-flat-active); }
.width-dot { display: block; background: currentColor; border-radius: 999px; }
.width-rect { display: block; background: currentColor; border-radius: 3px; }
.rail-pop-panel { width: 260px; display: flex; flex-direction: column; gap: 8px; }
.rail-pop-panel.wide { width: 320px; max-height: min(72vh, 680px); overflow-y: auto; }
.rail-pop-panel h3 { margin: 0; font-size: 15px; font-weight: 700; text-align: center; }
.pop-label { font-size: 12px; font-weight: 700; color: var(--fg-muted); }
.pop-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
.pop-grid.four { grid-template-columns: repeat(4, 1fr); }
.pop-grid.one-col { grid-template-columns: 1fr; }
.pop-choice { min-height: 38px; display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--control, var(--button-bg)); color: var(--text, var(--fg)); }
.pop-choice.tile { flex-direction: column; justify-content: center; font-size: 10px; text-align: center; }
.pop-choice small { line-height: 1.1; }
.pop-choice.active { background: color-mix(in srgb, var(--accent) 18%, white); border-color: var(--accent); color: var(--accent); }
.check-row { display: flex; gap: 8px; align-items: center; font-size: 13px; }
.block { width: 100%; justify-content: center; }
.emoji-panel { width: 220px; }
.emoji-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
.wide-emoji { width: 220px; }
.emoji-choice { height: 34px; border: 1px solid var(--border); border-radius: 8px; background: var(--button-bg); font-size: 18px; }
.constraints-box { display: flex; flex-direction: column; gap: 6px; }
.pop-header {
  width: 100%;
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  font-size: 15px;
}
.pop-close { position: absolute; right: 0; top: 50%; transform: translateY(-50%); width: 30px; height: 30px; }
.pref-heading {
  margin: 12px 4px 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--fg-muted);
}
.adw-list {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--card-bg, var(--popover-bg));
}
.adw-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: var(--fg);
  text-align: left;
}
.adw-row:last-child { border-bottom: 0; }
.adw-row:hover { background: var(--accent-bg); }
.adw-row.active { background: var(--accent-bg); color: var(--accent); }
.row-icon { width: 28px; height: 28px; flex: 0 0 28px; }
.row-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.row-text small { color: var(--fg-muted); font-size: 11.5px; line-height: 1.25; }
.combo-row, .spin-row, .switch-row {
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--card-bg, var(--popover-bg));
  font-size: 13px;
}
.combo-row:first-of-type,
.spin-row:first-of-type,
.switch-row:first-of-type { border-top-left-radius: 10px; border-top-right-radius: 10px; }
.combo-row:last-of-type,
.spin-row:last-of-type,
.switch-row:last-of-type { border-bottom-left-radius: 10px; border-bottom-right-radius: 10px; border-bottom: 0; }
.combo-row > span:first-child,
.spin-row > span:first-child,
.switch-row > span:first-child { display: flex; flex-direction: column; gap: 2px; }
.combo-row small, .spin-row small, .switch-row small { color: var(--fg-muted); font-size: 11px; }
.combo-row select {
  min-width: 132px;
  height: 30px;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--button-bg);
  color: var(--fg);
}
.spin-row input {
  width: 88px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--button-bg);
  color: var(--fg);
  text-align: right;
}
.switch-row input[type='checkbox'] { width: 22px; height: 22px; accent-color: var(--accent); }
.grouped-icon-picker { width: 250px; display: flex; flex-direction: column; gap: 12px; }
.icon-picker-group { display: flex; flex-direction: column; gap: 6px; }
.group-name { font-size: 12px; font-weight: 700; color: var(--fg-muted); }
.icon-flow { display: flex; flex-wrap: wrap; gap: 4px; }
.icon-tile {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--fg);
}
.icon-tile:hover { background: var(--accent-bg); }
.icon-tile.active { background: var(--accent-bg); border-color: var(--accent); color: var(--accent); }
.selection-label { margin-top: 8px; text-align: center; font-size: 12px; color: var(--fg-muted); }
@media (max-width: 640px) {
  .compact-sidebar { width: 56px; padding: 4px; }
  .rail-pop-panel, .rail-pop-panel.wide { width: min(300px, calc(100vw - 32px)); }
}
</style>
