<script setup lang="ts">
// Custom color editor, porting GTK4's private GtkColorEditor (the window that
// GtkColorDialog opens from the colorpicker colordialog button; rnote builds it
// with `.modal(false).with_alpha(true)`):
//   * saturation/value square on the left with a double-ring indicator
//   * a VERTICAL hue bar on its right
//   * a horizontal alpha bar over a checkerboard
//   * a hex entry and an eyedropper (screen picker) button
//   * a "Custom" expander revealing R/G/B/A GtkSpinButtons (stacked arrows)
// GTK has NO RGB/HSV numeric-mode switch; the numeric fields are always RGB(A).
// Emits update:modelValue live.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Color } from '../../compose/style/color'
import RnoteIcon from '../icons/RnoteIcon.vue'
import RnNumberInput from './RnNumberInput.vue'
import RnTextInput from './RnTextInput.vue'

const props = withDefaults(
  defineProps<{ modelValue: Color; withAlpha?: boolean }>(),
  { withAlpha: true }
)
const emit = defineEmits<{ (e: 'update:modelValue', c: Color): void }>()
const { t } = useI18n()

// ---- HSV helpers (sRGB 0..1 / hue 0..360) ----
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  return [h, s, max]
}
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [r + m, g + m, b + m]
}

const hue = ref(0)
const sat = ref(0)
const val = ref(0)
function syncFromColor() {
  const [h, s, v] = rgbToHsv(props.modelValue.r, props.modelValue.g, props.modelValue.b)
  hue.value = h
  sat.value = s
  val.value = v
}
syncFromColor()

function emitHsv(h: number, s: number, v: number, a = props.modelValue.a) {
  const [r, g, b] = hsvToRgb(h, s, v)
  emit('update:modelValue', new Color(r, g, b, a))
}
function setHsv(patch: Partial<{ h: number; s: number; v: number }>) {
  const h = patch.h ?? hue.value
  const s = patch.s ?? sat.value
  const v = patch.v ?? val.value
  hue.value = h
  sat.value = s
  val.value = v
  emitHsv(h, s, v)
}

// ---- SV plane drag ----
const svEl = ref<HTMLElement | null>(null)
function svFromEvent(e: PointerEvent) {
  const r = svEl.value!.getBoundingClientRect()
  const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
  const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
  setHsv({ s, v })
}
function svDown(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  svFromEvent(e)
}
function svMove(e: PointerEvent) {
  if (e.buttons === 1) svFromEvent(e)
}

// ---- VERTICAL hue bar drag ----
const hueEl = ref<HTMLElement | null>(null)
function hueFromEvent(e: PointerEvent) {
  const r = hueEl.value!.getBoundingClientRect()
  const f = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
  setHsv({ h: f * 360 })
}
function hueDown(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  hueFromEvent(e)
}
function hueMove(e: PointerEvent) {
  if (e.buttons === 1) hueFromEvent(e)
}

// ---- HORIZONTAL alpha bar drag ----
function alphaFromEvent(e: PointerEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
  emit('update:modelValue', props.modelValue.withAlpha(f))
}
function alphaDown(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  alphaFromEvent(e)
}
function alphaMove(e: PointerEvent) {
  if (e.buttons === 1) alphaFromEvent(e)
}

// ---- Custom expander (reveals RGB(A) spin buttons) ----
const customOpen = ref(false)
function toggleCustom() {
  customOpen.value = !customOpen.value
}

// ---- numeric fields (always RGB) ----
const rgb8 = computed(() => props.modelValue.toRgba8())
const alpha8 = computed(() => Math.round(props.modelValue.a * 255))
function setRgb(ch: 0 | 1 | 2, v: number) {
  const [r, g, b] = rgb8.value
  const arr = [r, g, b]
  arr[ch] = Math.min(255, Math.max(0, Math.round(v)))
  emit('update:modelValue', Color.fromRgba8(arr[0], arr[1], arr[2], Math.round(props.modelValue.a * 255)))
  syncFromColor()
}
function setAlpha8(v: number) {
  emit('update:modelValue', props.modelValue.withAlpha(Math.min(255, Math.max(0, Math.round(v))) / 255))
}

// ---- hex ----
const hexText = computed({
  get: () => (props.withAlpha ? props.modelValue.toHex8() : props.modelValue.toHex(false)),
  set: (v: string) => {
    const s = v.trim()
    if (/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) {
      emit('update:modelValue', Color.fromHex(s.startsWith('#') ? s : `#${s}`))
      syncFromColor()
    }
  }
})

// ---- eyedropper (screen picker) ----
const eyeSupported = computed(() => typeof (window as any).EyeDropper !== 'undefined')
async function pickScreen() {
  try {
    const eye = new (window as any).EyeDropper()
    const res = await eye.open()
    if (res?.sRGBHex) {
      emit('update:modelValue', Color.fromHex(res.sRGBHex).withAlpha(props.modelValue.a))
      syncFromColor()
    }
  } catch {
    /* user cancelled */
  }
}

// ---- GNOME palette (rnote-compose color::GNOME_*): 9 hue groups, each 5
// lightness steps. Laid out as one hue per column, 5 rows, matching the classic
// GTK color-chooser palette. Picking a swatch keeps the current alpha.
const PALETTE: string[][] = [
  ['#99c1f1', '#62a0ea', '#3584e4', '#1c71d8', '#1a5fb4'],
  ['#8ff0a4', '#57e389', '#33d17a', '#2ec27e', '#26a269'],
  ['#f9f06b', '#f8e45c', '#f6d32d', '#f5c211', '#e5a50a'],
  ['#ffbe6f', '#ffa348', '#ff7800', '#e66100', '#c64600'],
  ['#f66151', '#ed333b', '#e01b24', '#c01c28', '#a51d2d'],
  ['#dc8add', '#c061cb', '#9141ac', '#813d9c', '#613583'],
  ['#cdab8f', '#b5835a', '#986a44', '#865e3c', '#63452c'],
  ['#ffffff', '#f6f5f4', '#deddda', '#c0bfbc', '#9a9996'],
  ['#77767b', '#5e5c64', '#3d3846', '#241f31', '#000000']
]
function pickSwatch(hx: string) {
  emit('update:modelValue', Color.fromHex(hx).withAlpha(props.modelValue.a))
  syncFromColor()
}
function swatchActive(hx: string): boolean {
  const c = Color.fromHex(hx)
  return (
    Math.abs(c.r - props.modelValue.r) < 0.012 &&
    Math.abs(c.g - props.modelValue.g) < 0.012 &&
    Math.abs(c.b - props.modelValue.b) < 0.012
  )
}

// ---- derived visuals ----
const pureHue = computed(() => {
  const [r, g, b] = hsvToRgb(hue.value, 1, 1)
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
})
const svBg = computed(() => ({
  background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0)), ${pureHue.value}`
}))
const svThumbStyle = computed(() => ({
  left: `${sat.value * 100}%`,
  top: `${(1 - val.value) * 100}%`
}))
const hueThumbStyle = computed(() => ({ top: `${(hue.value / 360) * 100}%` }))
const alphaThumbStyle = computed(() => ({ left: `${props.modelValue.a * 100}%` }))
const alphaBarBg = computed(() => {
  const c = props.modelValue.withAlpha(1).toCss()
  return { background: `linear-gradient(to right, rgba(0,0,0,0), ${c})` }
})
// Vertical hue: red at the bottom, cycling yellow->green->cyan->blue->magenta to red at top.
const HUE_GRADIENT_V =
  'linear-gradient(to top,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)'
</script>

<template>
  <div class="color-dialog">
    <!-- SV square + vertical hue bar -->
    <div class="top-row">
      <div
        ref="svEl"
        class="sv-plane"
        @pointerdown="svDown"
        @pointermove="svMove"
      >
        <div class="plane-bg" :style="svBg"></div>
        <span class="sv-thumb" :style="svThumbStyle"></span>
      </div>
      <div
        ref="hueEl"
        class="hue-bar-v"
        @pointerdown="hueDown"
        @pointermove="hueMove"
      >
        <div class="hue-bg" :style="{ background: HUE_GRADIENT_V }"></div>
        <span class="hue-thumb-v" :style="hueThumbStyle"></span>
      </div>
    </div>

    <!-- horizontal alpha bar -->
    <div v-if="withAlpha" class="alpha-bar-h"
      @pointerdown="alphaDown" @pointermove="alphaMove">
      <div class="alpha-track"></div>
      <div class="alpha-fill" :style="alphaBarBg"></div>
      <span class="alpha-thumb-h" :style="alphaThumbStyle"></span>
    </div>

    <!-- hex + eyedropper -->
    <div class="hex-row">
      <RnTextInput class="hex-input" :model-value="hexText" monospace @update:model-value="hexText = $event" />
      <button v-if="eyeSupported" type="button" class="btn picker-btn" :title="t('Pick a color from the screen')" @click="pickScreen">
        <RnoteIcon name="color-picker" />
      </button>
    </div>

    <!-- GNOME palette: 9 hue columns x 5 lightness rows -->
    <div class="palette">
      <div v-for="(g, ci) in PALETTE" :key="ci" class="pal-col">
        <button
          v-for="(hx, ri) in g"
          :key="ri"
          type="button"
          class="swatch"
          :class="{ active: swatchActive(hx) }"
          :style="{ background: hx }"
          @click="pickSwatch(hx)"
        ></button>
      </div>
    </div

    <!-- Custom expander -->
    <button type="button" class="custom-toggle" @click="toggleCustom">
      <RnoteIcon :name="customOpen ? 'chevron-down' : 'chevron-right'" />
      <span>{{ t('Custom') }}</span>
    </button>

    <!-- RGB(A) spin buttons -->
    <div v-if="customOpen" class="num-grid">
      <div class="num-cell"><span class="num-cap r">R</span>
        <RnNumberInput :model-value="rgb8[0]" :min="0" :max="255" :step="1" :width="60" layout="vertical" @update:model-value="setRgb(0,$event)" /></div>
      <div class="num-cell"><span class="num-cap g">G</span>
        <RnNumberInput :model-value="rgb8[1]" :min="0" :max="255" :step="1" :width="60" layout="vertical" @update:model-value="setRgb(1,$event)" /></div>
      <div class="num-cell"><span class="num-cap b">B</span>
        <RnNumberInput :model-value="rgb8[2]" :min="0" :max="255" :step="1" :width="60" layout="vertical" @update:model-value="setRgb(2,$event)" /></div>
      <div v-if="withAlpha" class="num-cell"><span class="num-cap a">A</span>
        <RnNumberInput :model-value="alpha8" :min="0" :max="255" :step="1" :width="60" layout="vertical" @update:model-value="setAlpha8" /></div>
    </div>
  </div>
</template>

<style scoped>
.color-dialog {
  display: flex;
  flex-direction: column;
  gap: 9px;
  width: 252px;
  padding: 4px;
}
/* SV square + vertical hue */
.top-row {
  display: flex;
  gap: 6px;
  height: 168px;
}
.sv-plane {
  position: relative;
  flex: 1;
  min-width: 0;
  cursor: crosshair;
  touch-action: none;
}
.plane-bg {
  position: absolute;
  inset: 0;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
}
/* GTK double-ring indicator; drawn above the plane and NOT clipped at edges */
.sv-thumb {
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.65);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 2;
}
.hue-bar-v {
  position: relative;
  width: 16px;
  cursor: pointer;
  touch-action: none;
}
.hue-bg {
  position: absolute;
  inset: 0;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
}
.hue-thumb-v {
  position: absolute;
  left: 50%;
  width: 16px;
  height: 8px;
  border-radius: 2px;
  background: #fff;
  border: 1.5px solid #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.65);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 2;
}
/* horizontal alpha */
.alpha-bar-h {
  position: relative;
  height: 14px;
  cursor: pointer;
  touch-action: none;
}
.alpha-track {
  position: absolute;
  inset: 0;
  border-radius: 7px;
  background-image:
    linear-gradient(45deg, #b8b8b8 25%, transparent 25%, transparent 75%, #b8b8b8 75%),
    linear-gradient(45deg, #b8b8b8 25%, #fff 25%, #fff 75%, #b8b8b8 75%);
  background-size: 12px 12px;
  background-position: 0 0, 6px 6px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
}
.alpha-fill {
  position: absolute;
  inset: 0;
  border-radius: 7px;
}
.alpha-thumb-h {
  position: absolute;
  top: 50%;
  width: 8px;
  height: 16px;
  border-radius: 2px;
  background: #fff;
  border: 1.5px solid #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.65);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 2;
}
/* hex + eye */
.hex-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.hex-input {
  flex: 1;
}
.picker-btn {
  width: 34px;
  height: 34px;
  min-width: 34px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--input-bg);
  display: grid;
  place-items: center;
}
/* GNOME palette */
.palette {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: 3px;
  padding-top: 2px;
}
.pal-col {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.swatch {
  appearance: none;
  height: 17px;
  min-height: 17px;
  padding: 0;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  cursor: pointer;
}
.swatch:hover {
  box-shadow: 0 0 0 1px var(--accent);
}
.swatch.active {
  box-shadow: 0 0 0 2px var(--accent);
  border-color: #fff;
}
/* Custom expander */
.custom-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  padding: 2px 8px 2px 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--fg-muted);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.custom-toggle:hover {
  background: var(--accent-bg);
  color: var(--fg);
}
.custom-toggle svg {
  width: 16px;
  height: 16px;
}
/* numeric */
.num-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 5px;
}
.num-cell {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 3px;
  min-width: 0;
}
.num-cap {
  font-size: 10px;
  font-weight: 700;
  text-align: center;
}
.num-cap.r { color: #e01b24 }
.num-cap.g { color: #26a269 }
.num-cap.b { color: #1c71d8 }
.num-cap.a { color: var(--fg-muted) }
.num-cell :deep(.rn-spin) {
  width: 100% !important;
}
</style>
