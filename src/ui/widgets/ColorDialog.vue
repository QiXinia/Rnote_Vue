<script setup lang="ts">
// Self-drawn port of GTK4's GtkColorChooserDialog -> GtkColorChooserWidget.
//
// Two views, exactly like the desktop widget:
//   * palette (default): 9 rows x 5 columns GNOME default palette, a "Custom"
//     heading, an add ("+") swatch and up to 8 recent custom swatches.
//   * editor: shown after pressing "+" (or editing a custom swatch) — a large
//     saturation/value plane, a vertical hue bar on its left, a horizontal
//     alpha bar underneath, a big colour sample and a #RRGGBB hex entry.
//     Double clicking the SV plane / hue / alpha bars opens numeric entries
//     (H 0-360, S/V/A 0-100), mirroring GTK's long-press spinbutton popovers.
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { Color, GTK_DEFAULT_PALETTE } from '../../compose/style/color'
import RnoteIcon from '../icons/RnoteIcon.vue'
import RnTextInput from './RnTextInput.vue'

const props = withDefaults(defineProps<{ modelValue: Color; withAlpha?: boolean }>(), { withAlpha: true })
const emit = defineEmits<{
  (e: 'update:modelValue', v: Color): void
  (e: 'view', v: View): void
}>()
const { t } = useI18n()

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

type View = 'palette' | 'editor'
const view = ref<View>('palette')
watch(view, (v) => emit('view', v))
const current = ref<Color>(props.modelValue ?? Color.BLACK)

// Editor colour state (HSV, GTK colour space): h in degrees, s/v/a in 0..1.
const h = ref(0)
const s = ref(0)
const v = ref(0)
const a = ref(1)
const hex = ref('#000000')

// --- recent custom colours (persisted, mirrors GSettings custom-colors) ---
const CUSTOM_KEY = 'rnote.gtk.custom-colors'
const customColors = ref<Color[]>(loadCustom())
const editingIndex = ref(-1) // -1 = adding a new swatch

function loadCustom(): Color[] {
  try {
    const arr = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]')
    if (Array.isArray(arr)) return arr.slice(0, 8).map((x) => Color.fromHex(String(x)))
  } catch {
    /* ignore */
  }
  return []
}
function saveCustom() {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(customColors.value.map((c) => c.toHex8())))
  } catch {
    /* ignore */
  }
}

const flatPalette = computed(() => GTK_DEFAULT_PALETTE.flat())

// --- colour helpers ---
function sameRgb(x: Color, y: Color) {
  const p = x.toRgba8()
  const q = y.toRgba8()
  return p[0] === q[0] && p[1] === q[1] && p[2] === q[2]
}
function sameRgba(x: Color, y: Color) {
  const p = x.toRgba8()
  const q = y.toRgba8()
  return p[0] === q[0] && p[1] === q[1] && p[2] === q[2] && p[3] === q[3]
}
function isDefaultColor(c: Color) {
  return GTK_DEFAULT_PALETTE.some((g) => g.some((q) => sameRgb(q, c)))
}
function tickColor(c: Color) {
  if (c.a === 0) return 'var(--fg)'
  return c.luma() < 0.5 ? '#ffffff' : 'rgba(0,0,0,0.6)'
}
function swatchVars(c: Color): Record<string, string> {
  return { '--mc': c.toCss(), '--tick': tickColor(c) }
}
function hexOf(c: Color) {
  const [r, g, b] = c.toRgba8()
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function syncFromColor(c: Color) {
  current.value = c
  const hsv = c.hsv()
  // Keep the previous hue for achromatic colours so the SV plane/hue bar do
  // not jump around for black/white/grey (GTK keeps the hue when s == 0).
  if (hsv.s !== 0) h.value = hsv.h
  s.value = hsv.s
  v.value = hsv.v
  a.value = c.a
  hex.value = hexOf(c)
}
syncFromColor(current.value)

watch(
  () => props.modelValue,
  (c) => {
    if (c && !sameRgba(c, current.value)) syncFromColor(c)
  }
)

function applyColor(c: Color) {
  current.value = c
  emit('update:modelValue', c)
}
function commitHsv() {
  const c = Color.fromHsv(h.value, s.value, v.value, props.withAlpha ? a.value : 1)
  applyColor(c)
  // The props watcher skips re-syncing when the colour is already current, so
  // keep the hex entry (and h/s/v are set by the drag handlers) in sync here.
  hex.value = hexOf(c)
}

// --- palette view actions ---
function pickPalette(c: Color) {
  applyColor(c) // palette swatches are opaque, matching GTK
}
function pickCustom(i: number) {
  applyColor(customColors.value[i])
}
function addCustom(c: Color) {
  const arr = customColors.value.filter((q) => !sameRgba(q, c))
  arr.unshift(c)
  customColors.value = arr.slice(0, 8)
  saveCustom()
}
function removeCustom(i: number) {
  customColors.value.splice(i, 1)
  saveCustom()
}
function openEditorAdd() {
  editingIndex.value = -1
  syncFromColor(current.value)
  closeNum()
  view.value = 'editor'
}
function openEditorEdit(i: number) {
  editingIndex.value = i
  const c = customColors.value[i]
  syncFromColor(c)
  applyColor(c)
  closeNum()
  view.value = 'editor'
}
function backToPalette() {
  const c = current.value
  if (editingIndex.value === -1) {
    if (!isDefaultColor(c)) addCustom(c)
  } else {
    addCustom(c) // re-saves the edited swatch at the front
  }
  closeNum()
  view.value = 'palette'
}

// --- hex entry (always #RRGGBB, alpha is controlled by the alpha bar) ---
function commitHex() {
  let str = hex.value.trim().replace(/^#/, '')
  if (str.length === 3) str = str.split('').map((ch) => ch + ch).join('')
  if (/^[0-9a-fA-F]{6}$/.test(str)) {
    const c = Color.fromHex(str)
    applyColor(props.withAlpha ? c.withAlpha(current.value.a) : c)
    syncFromColor(current.value)
  } else {
    hex.value = hexOf(current.value)
  }
}

// --- screen colour picker (EyeDropper, Chromium only) ---
const eyeSupported = typeof window !== 'undefined' && 'EyeDropper' in window
async function pickScreen() {
  try {
    const res = await new (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper().open()
    const c = Color.fromHex(res.sRGBHex)
    const cc = props.withAlpha ? c.withAlpha(current.value.a) : c
    applyColor(cc)
    syncFromColor(cc)
  } catch {
    /* cancelled */
  }
}

// --- pointer dragging on SV plane / hue / alpha ---
const svEl = ref<HTMLElement | null>(null)
const hueEl = ref<HTMLElement | null>(null)
const alphaEl = ref<HTMLElement | null>(null)

function pointerDrag(e: PointerEvent, el: HTMLElement, cb: (x: number, y: number) => void) {
  e.preventDefault()
  e.stopPropagation()
  try {
    el.setPointerCapture(e.pointerId)
  } catch {
    /* ignore */
  }
  const rect = el.getBoundingClientRect()
  const sample = (cx: number, cy: number) => cb(clamp((cx - rect.left) / rect.width, 0, 1), clamp((cy - rect.top) / rect.height, 0, 1))
  const move = (ev: PointerEvent) => sample(ev.clientX, ev.clientY)
  const up = () => {
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  sample(e.clientX, e.clientY)
}
function startSV(e: PointerEvent) {
  pointerDrag(e, svEl.value!, (x, y) => {
    s.value = x
    v.value = 1 - y
    commitHsv()
  })
}
function startHue(e: PointerEvent) {
  pointerDrag(e, hueEl.value!, (x, y) => {
    void x
    h.value = y * 360
    commitHsv()
  })
}
function startAlpha(e: PointerEvent) {
  pointerDrag(e, alphaEl.value!, (x) => {
    a.value = x
    commitHsv()
  })
}

// --- numeric entry bar (double click a control, like GTK long-press) ---
const numPop = ref<{ target: null | 'sv' | 'h' | 'a'; h: string; s: string; v: string; a: string }>({
  target: null,
  h: '',
  s: '',
  v: '',
  a: ''
})
function openNum(target: 'sv' | 'h' | 'a') {
  numPop.value = {
    target,
    h: String(Math.round(h.value)),
    s: String(Math.round(s.value * 100)),
    v: String(Math.round(v.value * 100)),
    a: String(Math.round(a.value * 100))
  }
}
function closeNum() {
  numPop.value.target = null
}
function onNum(field: 'h' | 's' | 'v' | 'a', val: string) {
  const n = parseFloat(val)
  if (Number.isNaN(n)) return
  if (field === 'h') h.value = clamp(n, 0, 360)
  else if (field === 's') s.value = clamp(n / 100, 0, 1)
  else if (field === 'v') v.value = clamp(n / 100, 0, 1)
  else a.value = clamp(n / 100, 0, 1)
  commitHsv()
}
onBeforeUnmount(closeNum)

// --- dynamic gradients ---
const svStyle = computed(() => ({
  background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0)), hsl(${h.value} 100% 50%)`
}))
const alphaStyle = computed(() => {
  const [r, g, b] = current.value.toRgba8()
  return {
    backgroundImage: `linear-gradient(to right, rgba(${r},${g},${b},0), rgba(${r},${g},${b},1)), repeating-conic-gradient(#cfcfcf 0% 25%, #ffffff 0% 50%)`,
    backgroundSize: '100% 100%, 14px 14px',
    backgroundPosition: '0 0, 0 0'
  }
})
const sampleStyle = computed(() => swatchVars(current.value))
</script>

<template>
  <div class="color-dialog">
    <!-- ============ PALETTE VIEW (default) ============ -->
    <div v-if="view === 'palette'" class="palette-view">
      <div class="palette-grid">
        <button
          v-for="(c, idx) in flatPalette"
          :key="idx"
          type="button"
          class="palette-swatch checker"
          :class="{ selected: sameRgb(c, current) }"
          :style="swatchVars(c)"
          @click="pickPalette(c)"
        >
          <RnoteIcon v-if="sameRgb(c, current)" name="check" class="tick" />
        </button>
      </div>

      <div class="custom-heading">{{ t('Custom') }}</div>
      <div class="custom-row">
        <button type="button" class="add-swatch" :title="t('Add custom color')" @click="openEditorAdd">
          <RnoteIcon name="list-add" />
        </button>
        <div
          v-for="(c, i) in customColors"
          :key="c.toHex8() + '_' + i"
          class="custom-swatch checker"
          :class="{ selected: sameRgba(c, current) }"
          :style="swatchVars(c)"
          @click="pickCustom(i)"
          @dblclick="openEditorEdit(i)"
          @contextmenu.prevent="removeCustom(i)"
        >
          <RnoteIcon v-if="sameRgba(c, current)" name="check" class="tick" />
          <button type="button" class="custom-del" :title="t('Remove custom color')" @click.stop="removeCustom(i)">
            <RnoteIcon name="close" />
          </button>
        </div>
      </div>
    </div>

    <!-- ============ EDITOR VIEW ============ -->
    <div v-else class="editor-view">
      <div class="editor-head">
        <button type="button" class="head-btn" :title="t('Back')" @click="backToPalette">
          <RnoteIcon name="go-previous" />
        </button>
        <span class="head-title">{{ t('Custom color') }}</span>
      </div>

      <div class="editor-grid">
        <button
          v-if="eyeSupported"
          type="button"
          class="picker-circle"
          :title="t('Pick a color from the screen')"
          @click="pickScreen"
        >
          <RnoteIcon name="color-picker" />
        </button>
        <div class="editor-sample checker" :style="sampleStyle"></div>
        <RnTextInput
          v-model="hex"
          class="hex-entry"
          monospace
          :title="t('Hexadecimal color')"
          @change="commitHex"
          @enter="commitHex"
        />

        <div ref="hueEl" class="hue-vertical" @pointerdown="startHue" @dblclick="openNum('h')">
          <div class="hue-cursor" :style="{ top: (h / 360) * 100 + '%' }"></div>
        </div>

        <div ref="svEl" class="sv-plane" :style="svStyle" @pointerdown="startSV" @dblclick="openNum('sv')">
          <div class="sv-cursor" :style="{ left: s * 100 + '%', top: (1 - v) * 100 + '%' }"></div>
        </div>

        <div
          v-if="withAlpha"
          ref="alphaEl"
          class="alpha-horizontal checker"
          :style="alphaStyle"
          @pointerdown="startAlpha"
          @dblclick="openNum('a')"
        >
          <div class="alpha-cursor" :style="{ left: a * 100 + '%' }"></div>
        </div>
      </div>

      <div v-if="numPop.target" class="num-bar" @pointerdown.stop>
        <template v-if="numPop.target === 'sv'">
          <label class="num-field">S<RnTextInput :model-value="numPop.s" inputmode="numeric" @update:model-value="onNum('s', $event)" /></label>
          <label class="num-field">V<RnTextInput :model-value="numPop.v" inputmode="numeric" @update:model-value="onNum('v', $event)" /></label>
        </template>
        <label v-else-if="numPop.target === 'h'" class="num-field">
          H<RnTextInput :model-value="numPop.h" inputmode="numeric" @update:model-value="onNum('h', $event)" />
        </label>
        <label v-else class="num-field">A<RnTextInput :model-value="numPop.a" inputmode="numeric" @update:model-value="onNum('a', $event)" /></label>
        <button type="button" class="num-close" @click="closeNum"><RnoteIcon name="close" /></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.color-dialog {
  width: 100%;
  color: var(--fg);
}

/* Shared checkerboard (alpha) backing. --mc is the possibly-transparent
   colour painted on top; matches GtkColorSwatch's alpha tile. */
.checker {
  background-image: linear-gradient(var(--mc), var(--mc)),
    repeating-conic-gradient(#cfcfcf 0% 25%, #ffffff 0% 50%);
  background-size: 100% 100%, 14px 14px;
  background-position: 0 0, 0 0;
  background-repeat: repeat;
}

/* ---------- palette view ---------- */
.palette-view {
  padding: 14px;
}
.palette-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-auto-rows: 22px;
  gap: 2px 4px;
}
.palette-swatch {
  border: 0;
  border-radius: 5px;
  padding: 0;
  cursor: pointer;
  position: relative;
  transition: filter 0.1s ease;
}
.palette-swatch:hover {
  filter: brightness(1.07);
}
.palette-swatch:active {
  filter: brightness(0.92);
}
.custom-heading {
  margin: 14px 2px 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--fg);
}
.custom-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}
.add-swatch,
.custom-swatch {
  flex: 0 0 26px;
  width: 26px;
  height: 22px;
  border-radius: 5px;
}
.add-swatch {
  border: 0;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--fg) 8%, transparent);
  color: var(--fg-muted);
  cursor: pointer;
}
.add-swatch:hover {
  background: color-mix(in srgb, var(--fg) 14%, transparent);
}
.add-swatch :deep(svg) {
  width: 15px;
  height: 15px;
}
.custom-swatch {
  position: relative;
  cursor: pointer;
  transition: filter 0.1s ease;
}
.custom-swatch:hover {
  filter: brightness(1.07);
}
.custom-swatch:active {
  filter: brightness(0.92);
}
.custom-del {
  position: absolute;
  top: -7px;
  right: -7px;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--fg-muted);
  color: var(--window-bg, #fff);
  display: none;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2;
}
.custom-swatch:hover .custom-del,
.custom-del:focus-visible {
  display: inline-flex;
}
.custom-del :deep(svg) {
  width: 10px;
  height: 10px;
}
.palette-swatch.selected,
.custom-swatch.selected {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 80%, #000 0%);
}
.tick {
  width: 13px;
  height: 13px;
  color: var(--tick);
  display: inline-flex;
}
.tick :deep(svg) {
  width: 13px;
  height: 13px;
}

/* ---------- editor view ---------- */
.editor-view {
  padding: 14px;
}
.editor-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}
.head-btn {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--fg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.head-btn:hover {
  background: var(--button-flat-hover);
}
.head-btn :deep(svg) {
  width: 18px;
  height: 18px;
}
.head-title {
  font-size: 13px;
  font-weight: 700;
}
.editor-grid {
  display: grid;
  grid-template-columns: 30px 1fr 80px;
  grid-template-rows: auto auto auto;
  column-gap: 10px;
  row-gap: 10px;
  align-items: stretch;
}
.picker-circle {
  grid-column: 1;
  grid-row: 1;
  justify-self: center;
  align-self: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--button-bg);
  color: var(--fg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.picker-circle:hover {
  background: var(--button-flat-hover);
}
.picker-circle :deep(svg) {
  width: 17px;
  height: 17px;
}
.editor-sample {
  grid-column: 2;
  grid-row: 1;
  height: 34px;
  border-radius: 6px;
  border: 1px solid var(--border);
}
.hex-entry {
  grid-column: 3;
  grid-row: 1;
  min-width: 0;
}
.hex-entry :deep(.rn-text) {
  height: 34px;
  padding: 0 8px;
  font-size: 12px;
  text-transform: uppercase;
}
.hue-vertical {
  grid-column: 1;
  grid-row: 2;
  justify-self: center;
  width: 22px;
  border-radius: 999px;
  background: linear-gradient(to bottom, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%);
  position: relative;
  touch-action: none;
  cursor: pointer;
  border: 1px solid var(--border);
}
.hue-cursor {
  position: absolute;
  left: -3px;
  right: -3px;
  height: 6px;
  transform: translateY(-50%);
  border-radius: 3px;
  background: #fff;
  box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.45);
  pointer-events: none;
}
.sv-plane {
  grid-column: 2 / span 2;
  grid-row: 2;
  width: 100%;
  aspect-ratio: 1 / 1;
  max-width: 300px;
  border-radius: 6px;
  border: 1px solid var(--border);
  position: relative;
  touch-action: none;
  cursor: crosshair;
}
.sv-cursor {
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: transparent;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}
.alpha-horizontal {
  grid-column: 2 / span 2;
  grid-row: 3;
  height: 18px;
  border-radius: 999px;
  border: 1px solid var(--border);
  position: relative;
  touch-action: none;
  cursor: pointer;
}
.alpha-cursor {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 6px;
  transform: translateX(-50%);
  border-radius: 3px;
  background: #fff;
  box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.45);
  pointer-events: none;
}

/* numeric entry bar */
.num-bar {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.num-field {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--fg-muted);
}
.num-field :deep(.rn-text) {
  width: 56px;
  height: 30px;
  padding: 0 8px;
}
.num-close {
  margin-left: auto;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--fg-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.num-close:hover {
  background: var(--button-flat-hover);
}
.num-close :deep(svg) {
  width: 14px;
  height: 14px;
}

/* ---------- mobile / touch ---------- */
@media (max-width: 640px) {
  .palette-view,
  .editor-view {
    padding: 12px;
  }
  .palette-grid {
    grid-auto-rows: 30px;
    gap: 3px 4px;
  }
  .add-swatch,
  .custom-swatch {
    flex-basis: 32px;
    width: 32px;
    height: 30px;
  }
  .custom-del {
    display: inline-flex;
  }
  .editor-grid {
    grid-template-columns: 32px 1fr 76px;
  }
  .num-field :deep(.rn-text) {
    height: 34px;
    width: 60px;
  }
}
</style>
