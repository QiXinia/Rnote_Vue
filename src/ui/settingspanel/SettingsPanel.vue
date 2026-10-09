<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../../stores/app'
import { Color } from '../../compose/style/color'
import { Vec2 } from '../../compose/geometry'
import {
  Format,
  FormatPredefined,
  Orientation,
  FORMAT_PREDEFINED_LABELS
} from '../../engine/document/format'
import { Layout } from '../../engine/document/layout'
import { PatternStyle, PATTERN_LABELS } from '../../engine/document/background'
import { languages, setLocale, currentLocale, msgctx } from '../../i18n'
import RnoteIcon from '../icons/RnoteIcon.vue'
import ColorField from '../colorpicker/ColorField.vue'
import RnSelect from '../widgets/RnSelect.vue'
import RnNumberInput from '../widgets/RnNumberInput.vue'
import RnSwitch from '../widgets/RnSwitch.vue'

const store = useAppStore()
const { t } = useI18n()
const engine = computed(() => store.engine)

const language = ref(currentLocale())
function changeLanguage(code: string) {
  language.value = code
  setLocale(code)
}

const predefinedOrder = [
  FormatPredefined.A6,
  FormatPredefined.A5,
  FormatPredefined.A4,
  FormatPredefined.A3,
  FormatPredefined.A2,
  FormatPredefined.Letter,
  FormatPredefined.Legal,
  FormatPredefined.Custom
]
const layoutOrder = [
  Layout.FixedSize,
  Layout.ContinuousVertical,
  Layout.SemiInfinite,
  Layout.Infinite
]
const patternOrder = [
  PatternStyle.None,
  PatternStyle.Lines,
  PatternStyle.Grid,
  PatternStyle.Dots,
  PatternStyle.IsometricGrid,
  PatternStyle.IsometricDots
]

// General preferences live in the app store (shared with the canvas cursor and
// persisted there).
const general = store.general
// Internal cursor value -> upstream gettext name (msgctxt "a cursor type").
// Internal cursor value -> upstream gettext name (msgctxt "a cursor type").
// Mirrors CURSORS_LIST in rnote-ui settingspanel/mod.rs.
const cursorOptions: [string, string][] = [
  ['cursor-crosshair-small', msgctx.cursorType('Crosshair (Small)')],
  ['cursor-crosshair-medium', msgctx.cursorType('Crosshair (Medium)')],
  ['cursor-crosshair-large', msgctx.cursorType('Crosshair (Large)')],
  ['cursor-dot-small', msgctx.cursorType('Dot (Small)')],
  ['cursor-dot-medium', msgctx.cursorType('Dot (Medium)')],
  ['cursor-dot-large', msgctx.cursorType('Dot (Large)')],
  ['cursor-teardrop-nw-small', msgctx.cursorType('Teardrop North-West (Small)')],
  ['cursor-teardrop-nw-medium', msgctx.cursorType('Teardrop North-West (Medium)')],
  ['cursor-teardrop-nw-large', msgctx.cursorType('Teardrop North-West (Large)')],
  ['cursor-teardrop-ne-small', msgctx.cursorType('Teardrop North-East (Small)')],
  ['cursor-teardrop-ne-medium', msgctx.cursorType('Teardrop North-East (Medium)')],
  ['cursor-teardrop-ne-large', msgctx.cursorType('Teardrop North-East (Large)')],
  ['cursor-teardrop-n-small', msgctx.cursorType('Teardrop North (Small)')],
  ['cursor-teardrop-n-medium', msgctx.cursorType('Teardrop North (Medium)')],
  ['cursor-teardrop-n-large', msgctx.cursorType('Teardrop North (Large)')],
  ['cursor-beam-small', msgctx.cursorType('Beam (Small)')],
  ['cursor-beam-medium', msgctx.cursorType('Beam (Medium)')],
  ['cursor-beam-large', msgctx.cursorType('Beam (Large)')]
]

const formatDraft = reactive({
  predefined: FormatPredefined.A3,
  orientation: Orientation.Portrait,
  width: 1123,
  height: 1587,
  dpi: 96
})
const docDraft = reactive({
  layout: Layout.Infinite,
  showBorders: true,
  borderColor: Color.fromRgba8(153, 191, 240),
  backgroundColor: Color.WHITE,
  pattern: PatternStyle.Dots,
  patternColor: Color.fromRgba8(204, 230, 255),
  patternWidth: 32,
  patternHeight: 32,
  showOrigin: false
})

// Button shortcuts mirror rnote-engine ShortcutAction: ChangePenStyle{style,mode}.
type ShortcutModeValue = 'temporary' | 'permanent' | 'toggle' | 'disabled'
interface ShortcutEntry { style: string; mode: ShortcutModeValue }
const penStyleOptions: [string, string][] = [
  ['pen', 'Brush'],
  ['shaper', 'Shaper'],
  ['typewriter', 'Typewriter'],
  ['eraser', 'Eraser'],
  ['selector', 'Selector'],
  ['tools', 'Tools']
]
const modeOptions: [ShortcutModeValue, string][] = [
  ['temporary', 'Temporary'],
  ['permanent', 'Permanent'],
  ['toggle', 'Toggle'],
  ['disabled', 'Disabled']
]
const defaultShortcuts: Record<string, ShortcutEntry> = {
  stylusPrimary: { style: 'eraser', mode: 'temporary' },
  stylusSecondary: { style: 'selector', mode: 'temporary' },
  mouseSecondary: { style: 'shaper', mode: 'temporary' },
  touchTwoFingerLongPress: { style: 'eraser', mode: 'toggle' },
  ctrlSpace: { style: 'tools', mode: 'toggle' },
  pad1: { style: 'brush', mode: 'permanent' },
  pad2: { style: 'shaper', mode: 'permanent' },
  pad3: { style: 'typewriter', mode: 'permanent' },
  pad4: { style: 'eraser', mode: 'permanent' }
}
const shortcutRows = reactive<Record<string, ShortcutEntry>>(loadShortcuts())

const shortcutMeta = [
  { key: 'stylusPrimary', label: 'Stylus Primary Button Action', subtitle: 'Set the action for the\nprimary stylus button', icon: 'stylus-button-primary' },
  { key: 'stylusSecondary', label: 'Stylus Secondary Button Action', subtitle: 'Set the action for the\nsecondary stylus button', icon: 'stylus-button-secondary' },
  { key: 'mouseSecondary', label: 'Mouse Secondary Button Action', subtitle: 'Set the action for the\nsecondary mouse button', icon: 'mouse-button-secondary' },
  { key: 'touchTwoFingerLongPress', label: 'Touch Two-Finger Long-Press Action', subtitle: 'Set the action for the touch\ntwo-finger long-press gesture', icon: 'touch-two-finger-long-press' },
  { key: 'ctrlSpace', label: 'Keyboard Ctrl-Space Action', subtitle: 'Set the action for the keyboard\nCtrl plus Space shortcut', icon: 'keyboard-ctrl-space-shortcut' },
  { key: 'pad1', label: 'Drawing Pad Button 1 Action', subtitle: 'Set the action for button 1\non a drawing pad', icon: 'drawing-pad-button-1' },
  { key: 'pad2', label: 'Drawing Pad Button 2 Action', subtitle: 'Set the action for button 2\non a drawing pad', icon: 'drawing-pad-button-2' },
  { key: 'pad3', label: 'Drawing Pad Button 3 Action', subtitle: 'Set the action for button 3\non a drawing pad', icon: 'drawing-pad-button-3' },
  { key: 'pad4', label: 'Drawing Pad Button 4 Action', subtitle: 'Set the action for button 4\non a drawing pad', icon: 'drawing-pad-button-4' }
] as const

watch(shortcutRows, () => {
  localStorage.setItem('rnote-web-shortcuts', JSON.stringify(shortcutRows))
}, { deep: true })
watch(() => store.activeTab?.id, syncDrafts, { immediate: true })

function loadShortcuts(): Record<string, ShortcutEntry> {
  let saved: Record<string, any> = {}
  try { saved = JSON.parse(localStorage.getItem('rnote-web-shortcuts') || '{}') } catch { saved = {} }
  const out: Record<string, ShortcutEntry> = {}
  for (const key of Object.keys(defaultShortcuts)) {
    const s = saved[key]
    if (s && typeof s === 'object' && typeof s.style === 'string') {
      out[key] = { style: s.style, mode: s.mode ?? defaultShortcuts[key].mode }
    } else if (typeof s === 'string') {
      // migrate legacy flat action value
      out[key] = { style: s, mode: defaultShortcuts[key].mode }
    } else {
      out[key] = { ...defaultShortcuts[key] }
    }
  }
  return out
}
function syncDrafts() {
  const e = engine.value
  if (!e) return
  const f = e.document.format
  const b = e.document.background
  Object.assign(formatDraft, {
    predefined: f.predefined,
    orientation: f.orientation,
    width: Math.round(f.width),
    height: Math.round(f.height),
    dpi: f.dpi
  })
  Object.assign(docDraft, {
    layout: e.document.layout,
    showBorders: f.showBorder,
    borderColor: f.borderColor.clone(),
    backgroundColor: b.color.clone(),
    pattern: b.pattern,
    patternColor: b.patternColor.clone(),
    patternWidth: b.patternSize.x,
    patternHeight: b.patternSize.y,
    showOrigin: e.settings.showGridCursor
  })
}

// --- Page Format / Document: mirror the desktop panel, which applies every
// change immediately (libadwaita preferences bind straight to the engine).
function commitFormat() {
  const e = engine.value
  if (!e) return
  const f = e.document.format
  f.dpi = formatDraft.dpi
  if (formatDraft.predefined !== FormatPredefined.Custom) {
    f.applyPredefined(formatDraft.predefined, formatDraft.dpi)
  }
  f.setOrientation(formatDraft.orientation)
  if (formatDraft.predefined === FormatPredefined.Custom) {
    f.setWidth(formatDraft.width)
    f.setHeight(formatDraft.height)
  }
  e.notify()
  store.bump()
}
function commitDocument() {
  const e = engine.value
  if (!e) return
  const f = e.document.format
  e.document.layout = docDraft.layout
  f.showBorder = docDraft.showBorders
  f.borderColor = docDraft.borderColor.clone()
  const bg = e.document.background
  bg.color = docDraft.backgroundColor.clone()
  bg.pattern = docDraft.pattern
  bg.patternColor = docDraft.patternColor.clone()
  bg.patternSize = new Vec2(docDraft.patternWidth, docDraft.patternHeight)
  e.settings.showGridCursor = docDraft.showOrigin
  e.notify()
  store.bump()
}
function onPredefinedChange(pre: FormatPredefined) {
  formatDraft.predefined = pre
  if (pre !== FormatPredefined.Custom) {
    const probe = new Format()
    probe.orientation = formatDraft.orientation
    probe.applyPredefined(pre, formatDraft.dpi)
    formatDraft.width = probe.width
    formatDraft.height = probe.height
  }
  commitFormat()
}
function setDraftOrientation(o: Orientation) {
  if (o !== formatDraft.orientation) {
    const tmp = formatDraft.width
    formatDraft.width = formatDraft.height
    formatDraft.height = tmp
  }
  formatDraft.orientation = o
  commitFormat()
}
function onDraftDpi(dpi: number) {
  formatDraft.dpi = dpi
  if (formatDraft.predefined !== FormatPredefined.Custom) {
    const probe = new Format()
    probe.orientation = formatDraft.orientation
    probe.applyPredefined(formatDraft.predefined, dpi)
    formatDraft.width = probe.width
    formatDraft.height = probe.height
  }
  commitFormat()
}
function onDraftWidth(width: number) {
  if (!Number.isFinite(width)) return
  formatDraft.width = width
  formatDraft.orientation = width > formatDraft.height ? Orientation.Landscape : Orientation.Portrait
  formatDraft.predefined = FormatPredefined.Custom
  commitFormat()
}
function onDraftHeight(height: number) {
  if (!Number.isFinite(height)) return
  formatDraft.height = height
  formatDraft.orientation = formatDraft.width > height ? Orientation.Landscape : Orientation.Portrait
  formatDraft.predefined = FormatPredefined.Custom
  commitFormat()
}
function invertColors() {
  docDraft.backgroundColor = docDraft.backgroundColor.toInvertedBrightnessColor()
  docDraft.patternColor = docDraft.patternColor.toInvertedBrightnessColor()
  commitDocument()
}
</script>

<template>
  <div class="settings-scroll">
    <div class="settings-clamp">
      <section class="prefs-group">
        <h2>{{ t('General') }}</h2>
        <div class="settings-row">
          <span><strong>{{ t('Language') }}</strong><small>{{ t('Set the application language') }}</small></span>
          <RnSelect
            :model-value="language"
            :width="190"
            :options="languages.map((l) => ({ value: l.code, label: l.nativeName }))"
            @update:model-value="(v: any) => changeLanguage(v)"
          />
        </div>
        <div class="settings-row switch-row">
          <span><strong>{{ t('Autosave') }}</strong><small>{{ t('Enable or disable autosave') }}</small></span>
          <RnSwitch v-model="general.autosave" />
        </div>
        <div class="settings-row spin-row">
          <span><strong>{{ t('Autosave Interval (secs)') }}</strong><small>{{ t('Set the autosave interval in seconds') }}</small></span>
          <RnNumberInput v-model="general.autosaveInterval" :min="5" :width="140" />
        </div>
        <div class="settings-row switch-row">
          <span><strong>{{ t('Show Scrollbars') }}</strong><small>{{ t('Set whether the scrollbars on the canvas are shown') }}</small></span>
          <RnSwitch v-model="general.showScrollbars" />
        </div>
        <div class="settings-row switch-row">
          <span><strong>{{ t('Optimize for E-Paper Displays') }}</strong><small>{{ t('Changes certain UI elements and modifies behaviour\nof tools for optimized usage on E-Paper displays') }}</small></span>
          <RnSwitch v-model="general.optimizeEPD" />
        </div>
        <div class="settings-row switch-row">
          <span><strong>{{ t('Inertial Touch Scrolling') }}</strong><small>{{ t('Set whether touch scrolling on the canvas is inertial.\nAn application restart is required when this option\ngets disabled.') }}</small></span>
          <RnSwitch v-model="general.inertialScrolling" />
        </div>
        <div class="settings-row">
          <span><strong>{{ t('Regular Cursor') }}</strong><small>{{ t('Set the regular cursor') }}</small></span>
          <RnSelect
            :model-value="general.regularCursor"
            :width="170"
            :options="cursorOptions.map(([v, l]) => ({ value: v, label: t(l) }))"
            @update:model-value="(v: any) => (general.regularCursor = v)"
          />
        </div>
        <div class="settings-row switch-row">
          <span><strong>{{ t('Show Drawing Cursor') }}</strong><small>{{ t('Set whether the drawing cursor is visible') }}</small></span>
          <RnSwitch v-model="general.showDrawingCursor" />
        </div>
        <div class="settings-row">
          <span><strong>{{ t('Drawing Cursor') }}</strong><small>{{ t('Set the drawing cursor') }}</small></span>
          <RnSelect
            :model-value="general.drawingCursor"
            :width="170"
            :options="cursorOptions.map(([v, l]) => ({ value: v, label: t(l) }))"
            @update:model-value="(v: any) => (general.drawingCursor = v)"
          />
        </div>
      </section>

      <section class="prefs-group">
        <div class="group-heading">
          <h2>{{ t('Page Format') }}</h2>
          <div class="heading-actions">
            <button class="btn flat icon-btn" :title="t('Save as Preset')"><RnoteIcon name="save" /></button>
            <button class="btn flat icon-btn" :title="t('Restore From Preset')"><RnoteIcon name="restore" /></button>
          </div>
        </div>
        <div class="settings-row">
          <span><strong>{{ t('Format') }}</strong><small>{{ t('Choose a format') }}</small></span>
          <RnSelect
            :model-value="formatDraft.predefined"
            :width="170"
            :options="predefinedOrder.map((p) => ({ value: p, label: t(FORMAT_PREDEFINED_LABELS[p]) }))"
            @update:model-value="(v: any) => onPredefinedChange(v)"
          />
        </div>
        <div class="settings-row">
          <span><strong>{{ t('Orientation') }}</strong><small>{{ t('Set the format orientation') }}</small></span>
          <div class="linked compact-linked">
            <button :class="{ active: formatDraft.orientation === Orientation.Portrait }" @click="setDraftOrientation(Orientation.Portrait)">{{ t('Portrait') }}</button>
            <button :class="{ active: formatDraft.orientation === Orientation.Landscape }" @click="setDraftOrientation(Orientation.Landscape)">{{ t('Landscape') }}</button>
          </div>
        </div>
        <div class="settings-row">
          <span><strong>{{ t('Width') }}</strong><small>{{ t('Set the format width') }}</small></span>
          <RnNumberInput :model-value="formatDraft.width" :width="150" @update:model-value="(v) => onDraftWidth(Number(v))" />
        </div>
        <div class="settings-row">
          <span><strong>{{ t('Height') }}</strong><small>{{ t('Set the format height') }}</small></span>
          <RnNumberInput :model-value="formatDraft.height" :width="150" @update:model-value="(v) => onDraftHeight(Number(v))" />
        </div>
        <div class="settings-row">
          <span><strong>{{ t('Dpi') }}</strong><small>{{ t('Set the Dpi (dots per inch). Defaults to 96.') }}</small></span>
          <RnNumberInput :model-value="formatDraft.dpi" :min="1" :width="150" @update:model-value="(v) => onDraftDpi(Number(v))" />
        </div>
        <div class="settings-row apply-row">
          <button class="btn" @click="syncDrafts">{{ t('Revert') }}</button>
        </div>
      </section>

      <section class="prefs-group">
        <div class="group-heading">
          <h2>{{ t('Document') }}</h2>
          <div class="heading-actions">
            <button class="btn flat icon-btn" :title="t('Save as Preset')"><RnoteIcon name="save" /></button>
            <button class="btn flat icon-btn" :title="t('Restore From Preset')"><RnoteIcon name="restore" /></button>
          </div>
        </div>
        <div class="settings-row">
          <span><strong>{{ t('Document Layout') }}</strong></span>
          <RnSelect
            :model-value="docDraft.layout"
            :width="180"
            :options="layoutOrder.map((l) => ({
              value: l,
              label: t(l === Layout.FixedSize ? 'Fixed Size' : l === Layout.ContinuousVertical ? 'Continuous Vertical' : l === Layout.SemiInfinite ? 'Semi Infinite' : 'Infinite')
            }))"
            @update:model-value="(v: any) => { docDraft.layout = v; commitDocument() }"
          />
        </div>
        <div class="settings-row switch-row">
          <span><strong>{{ t('Show Format Borders') }}</strong><small>{{ t('Set whether the format borders are shown') }}</small></span>
          <RnSwitch :model-value="docDraft.showBorders" @update:model-value="(v) => { docDraft.showBorders = v; commitDocument() }" />
        </div>
        <div class="settings-row color-row">
          <span><strong>{{ t('Format Border Color') }}</strong><small>{{ t('Set the format border color') }}</small></span>
          <ColorField :model-value="docDraft.borderColor" @update:model-value="(v) => { docDraft.borderColor = v; commitDocument() }" />
        </div>
        <div class="settings-row color-row">
          <span><strong>{{ t('Color') }}</strong><small>{{ t('Set the background color') }}</small></span>
          <ColorField :model-value="docDraft.backgroundColor" @update:model-value="(v) => { docDraft.backgroundColor = v; commitDocument() }" />
        </div>
        <div class="settings-row">
          <span><strong>{{ t('Pattern') }}</strong><small>{{ t('Choose a background pattern') }}</small></span>
          <RnSelect
            :model-value="docDraft.pattern"
            :width="180"
            :options="patternOrder.map((p) => ({ value: p, label: t(PATTERN_LABELS[p]) }))"
            @update:model-value="(v: any) => { docDraft.pattern = v; commitDocument() }"
          />
        </div>
        <div class="settings-row color-row">
          <span><strong>{{ t('Pattern Color') }}</strong><small>{{ t('Set the background pattern color') }}</small></span>
          <ColorField :model-value="docDraft.patternColor" @update:model-value="(v) => { docDraft.patternColor = v; commitDocument() }" />
        </div>
        <div class="settings-row">
          <span><strong>{{ t('Pattern Width') }}</strong><small>{{ t('Set the background pattern width') }}</small></span>
          <RnNumberInput :model-value="docDraft.patternWidth" :width="150" @update:model-value="() => commitDocument()" />
        </div>
        <div class="settings-row">
          <span><strong>{{ t('Pattern Height') }}</strong><small>{{ t('Set the background pattern height') }}</small></span>
          <RnNumberInput :model-value="docDraft.patternHeight" :width="150" @update:model-value="() => commitDocument()" />
        </div>
        <div class="settings-row switch-row">
          <span><strong>{{ t('Show Origin Indicator') }}</strong><small>{{ t('Set whether the document origin indicator is shown') }}</small></span>
          <RnSwitch :model-value="docDraft.showOrigin" @update:model-value="(v) => { docDraft.showOrigin = v; commitDocument() }" />
        </div>
        <div class="settings-row">
          <span><strong>{{ t('Invert Color Brightness') }}</strong><small>{{ t('Invert the brightness of the background and pattern colors') }}</small></span>
          <button class="btn" @click="invertColors">{{ t('Invert') }}</button>
        </div>
      </section>

      <section class="prefs-group">
        <h2>{{ t('Button Shortcuts') }}</h2>
        <div v-for="meta in shortcutMeta" :key="meta.key" class="settings-row shortcut-row">
          <span class="shortcut-label">
            <RnoteIcon :name="meta.icon" class="shortcut-icon" />
            <span><strong>{{ t(meta.label) }}</strong><small>{{ t(meta.subtitle) }}</small></span>
          </span>
          <span class="shortcut-selects">
            <RnSelect
              :model-value="shortcutRows[meta.key].style"
              :width="116"
              :options="penStyleOptions.map(([v, l]) => ({ value: v, label: t(l) }))"
              @update:model-value="(v: any) => (shortcutRows[meta.key].style = v)"
            />
            <RnSelect
              :model-value="shortcutRows[meta.key].mode"
              :width="112"
              :options="modeOptions.map(([v, l]) => ({ value: v, label: t(l) }))"
              @update:model-value="(v: any) => (shortcutRows[meta.key].mode = v)"
            />
          </span>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-scroll {
  height: 100%;
  overflow-y: auto;
  background: var(--sidebar-bg);
}
.settings-clamp {
  max-width: 800px;
  margin: 0 auto;
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}
.prefs-group {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--card-bg, var(--popover-bg));
}
.prefs-group h2,
.group-heading h2 {
  margin: 0;
  padding: 12px 14px;
  font-size: 14px;
  font-weight: 800;
}
.group-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.heading-actions { display: flex; gap: 2px; }
.settings-row {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  border-top: 1px solid var(--border);
}
.settings-row > span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.settings-row strong { font-size: 13px; font-weight: 700; }
.settings-row small { font-size: 11px; opacity: 0.7; }
.number-input { width: 110px; }
.shortcut-label { display: flex; align-items: center; gap: 12px; flex-direction: row !important; }
.shortcut-icon { width: 28px; height: 28px; flex: 0 0 auto; opacity: 0.9; }
.shortcut-label > span { display: flex; flex-direction: column; min-width: 0; align-items: flex-start; text-align: left; }
.shortcut-label strong { font-size: 13px; font-weight: 700; }
.shortcut-label small { white-space: pre-line; color: var(--fg-muted); font-size: 11.5px; line-height: 1.4; }
.shortcut-selects { display: inline-flex; gap: 6px; flex: 0 0 auto; }
.shortcut-selects select { min-width: 96px; }
.apply-row { justify-content: space-between; }
</style>
