<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../../stores/app'
import { Color } from '../../compose/style/color'
import { PenStyle } from '../../engine/pens/pensconfig'
import { BrushStyleKind } from '../../engine/pens/pensconfig'
import RnoteIcon from '../icons/RnoteIcon.vue'
import ColorDialog from '../widgets/ColorDialog.vue'
import { colorToHsvLabelString } from '../../compose/style/okhsv-label'

const store = useAppStore()
const { t } = useI18n()
const e = computed(() => store.engine)
// Engine state lives in markRaw objects; depend on uiTick so computed colors
// re-evaluate after every engine mutation (store.bump()).
const tick = computed(() => store.uiTick)
const target = ref<'stroke' | 'fill'>('stroke')
const customOpen = ref(false)
const customBtn = ref<HTMLButtonElement | null>(null)
const popPos = ref<Record<string, string>>({})

async function openCustom() {
  if (customOpen.value) {
    customOpen.value = false
    return
  }
  window.dispatchEvent(new Event('rnote:close-popovers'))
  customOpen.value = true
  await nextTick()
  const r = customBtn.value!.getBoundingClientRect()
  const pw = 268
  const ph = 350
  let top = r.bottom + 6
  if (top + ph > window.innerHeight - 8) top = r.top - ph - 6
  let left = r.right - pw
  left = Math.max(8, Math.min(left, window.innerWidth - pw - 8))
  popPos.value = { left: `${left}px`, top: `${Math.max(8, top)}px` }
}

// Exact defaults from rnote-ui/src/colorpicker/mod.rs RnColorPicker::default_color().
// gdk::RGBA float components *255, rounded:
//   i3 (0.597,0.753,0.941) -> (152,192,240)
//   i4 (0.101,0.371,0.703) -> (26,95,179)
//   i5 (0.148,0.632,0.410) -> (38,161,105)
//   i6 (0.957,0.757,0.066) -> (244,193,17)
//   i7 (0.898,0.378,0.000) -> (229,96,0)
//   i8 (0.644,0.113,0.175) -> (164,29,45)
const setterColors = ref<Color[]>([
  Color.BLACK,
  Color.WHITE,
  Color.TRANSPARENT,
  Color.fromRgba8(152, 192, 240),
  Color.fromRgba8(26, 95, 179),
  Color.fromRgba8(38, 161, 105),
  Color.fromRgba8(244, 193, 17),
  Color.fromRgba8(229, 96, 0),
  Color.fromRgba8(164, 29, 45)
])
const activeSetter = ref<number | null>(null)

const strokeColor = computed(() => {
  void tick.value
  return e.value?.activeColor() ?? Color.BLACK
})
const fillColor = computed(() => {
  void tick.value
  if (!e.value) return Color.TRANSPARENT
  const pc = e.value.pensConfig
  if (pc.penModeStyle === PenStyle.Brush) {
    if (pc.brush.style === BrushStyleKind.Marker) return pc.brush.markerOptions.fill_color ?? Color.TRANSPARENT
    if (pc.brush.style === BrushStyleKind.Solid) return pc.brush.solidOptions.fill_color ?? Color.TRANSPARENT
    return Color.TRANSPARENT
  }
  if (pc.penModeStyle === PenStyle.Shaper) return pc.shaper.fill() ?? Color.TRANSPARENT
  return Color.TRANSPARENT
})
const activeColor = computed(() => (target.value === 'stroke' ? strokeColor.value : fillColor.value))
const caption = computed(() => colorToHsvLabelString(activeColor.value))

function apply(c: Color) {
  if (!e.value) return
  if (target.value === 'fill') e.value.pensConfig.setAllFillColors(c)
  else e.value.pensConfig.setAllStrokeColors(c)
  if (activeSetter.value !== null) setterColors.value[activeSetter.value] = c
  e.value.notify()
  store.bump()
}
function pick(c: Color, index: number) {
  activeSetter.value = index
  apply(c)
  customOpen.value = false
}
function isActive(index: number) {
  if (activeSetter.value !== null) return activeSetter.value === index
  return setterColors.value.findIndex((c) => c.equals(activeColor.value)) === index
}
watch(activeColor, (c) => {
  if (activeSetter.value !== null && !setterColors.value[activeSetter.value].equals(c)) activeSetter.value = null
})
// Foreground / indicator color, mirroring colorpad.rs & colorsetter.rs:
//   alpha == 0 -> @window_fg_color
//   luma < FG_LUMINANCE_THRESHOLD (0.7, dark bg) -> @light_1 (#ffffff)
//   otherwise (light bg) -> @dark_5 (#77767b)
function padFg(c: Color) {
  if (c.a === 0) return 'var(--fg)'
  return c.luma() < 0.7 ? '#ffffff' : '#77767b'
}
function selectTarget(which: 'stroke' | 'fill') {
  target.value = which
  activeSetter.value = null
  customOpen.value = false
}
// GTK dialogs close on Escape; the popover is teleported to <body>, so listen
// globally while it is open.
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && customOpen.value) {
    e.stopPropagation()
    customOpen.value = false
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <div v-if="e" class="colorpicker" :aria-label="t('Color picker')">
    <div class="color-row overlay_toolbar">
      <div class="color-pads">
        <button
          class="color-pad"
          :class="{ checked: target === 'stroke' }"
          :style="{ backgroundColor: strokeColor.toCss(), color: padFg(strokeColor) }"
          v-tip="t('Stroke Color')"
          @click="selectTarget('stroke')"
        ><RnoteIcon name="stroke-color" class="pad-icon" /></button>
        <button
          class="color-pad"
          :class="{ checked: target === 'fill' }"
          :style="{ backgroundColor: fillColor.toCss(), color: padFg(fillColor) }"
          v-tip="t('Fill Color')"
          @click="selectTarget('fill')"
        ><RnoteIcon name="fill-color" class="pad-icon" /></button>
      </div>
      <span class="picker-separator"></span>
      <div class="color-setters linked">
        <button
          v-for="(c, i) in setterColors"
          :key="i"
          class="color-setter"
          :class="{ checked: isActive(i) }"
          :style="{ backgroundColor: c.toCss(), color: padFg(c) }"
          v-tip="c.a === 0 ? t('No color') : c.toHex8()"
          @click="pick(c, i)"
        ></button>
      </div>
      <div class="custom-color-wrap">
        <button ref="customBtn" class="btn flat icon-btn" :class="{ toggled: customOpen }" v-tip="t('Custom color')" @click.stop="openCustom">
          <RnoteIcon name="preferences-color" />
        </button>
      </div>
    </div>
    <div class="active-caption">{{ caption }}</div>

    <Teleport to="body">
      <template v-if="customOpen">
        <div class="popover-backdrop" @click.stop="customOpen = false" @contextmenu.prevent="customOpen = false"></div>
        <div class="custom-color-pop" :style="popPos" @click.stop>
          <ColorDialog :model-value="activeColor" :with-alpha="true" @update:model-value="apply" />
        </div>
      </template>
    </Teleport>
  </div>
</template>

<style scoped>
.colorpicker {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.color-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 46px;
}
.color-pads {
  display: flex;
  gap: 3px;
}
.color-pad,
.color-setter {
  position: relative;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--border);
  background-blend-mode: screen;
  background-image:
    linear-gradient(45deg, rgba(15, 15, 15, 0.33) 25%, transparent 25%, transparent 75%, rgba(15, 15, 15, 0.33) 75%, rgba(15, 15, 15, 0.33)),
    linear-gradient(45deg, rgba(15, 15, 15, 0.33) 25%, transparent 25%, transparent 75%, rgba(15, 15, 15, 0.33) 75%, rgba(15, 15, 15, 0.33));
  background-size: 18px 18px;
  background-position: 0 0, 9px 9px;
  transition: filter 0.15s ease-out;
}
.color-pad { border-radius: 4px; }
.color-setter { border-radius: 2px; }
.color-pad:hover,
.color-setter:hover { filter: brightness(0.93); }
.color-pad:active,
.color-setter:active { filter: brightness(0.86); }
.color-pad.checked {
  border-color: var(--accent);
  box-shadow: 0 0 3px 1px var(--accent), inset 0 -3px 0 currentColor;
}
.color-setter.checked {
  box-shadow: inset 0 -3px 0 currentColor;
}
.pad-icon {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 16px;
  height: 16px;
  pointer-events: none;
}
.picker-separator {
  width: 1px;
  height: 24px;
  background: var(--border);
}
.color-setters {
  display: flex;
  gap: 6px;
  align-items: center;
}
.custom-color-wrap { position: relative; }
.custom-color-pop {
  position: fixed;
  z-index: 130;
  padding: 10px;
  background: var(--popover-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-pop);
}
.active-caption {
  font-size: 11px;
  color: var(--fg-muted);
}
@media (max-width: 640px) {
  .colorpicker { transform: scale(0.86); transform-origin: top center; }
}
</style>
