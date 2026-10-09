<script setup lang="ts">
// Custom number entry with +/- steppers, porting libadwaita's AdwSpinButton.
// Replaces native <input type="number">.
import { computed } from 'vue'
import RnoteIcon from '../icons/RnoteIcon.vue'

const props = withDefaults(
  defineProps<{
    modelValue: number
    min?: number
    max?: number
    step?: number
    digits?: number
    width?: number
    suffix?: string
    layout?: 'horizontal' | 'vertical'
  }>(),
  { step: 1, digits: 0, width: 120, layout: 'horizontal' }
)
const emit = defineEmits<{
  (e: 'update:modelValue', v: number): void
  (e: 'change', v: number): void
}>()

const text = computed(() => {
  const d = props.digits
  return Number(props.modelValue).toFixed(d)
})
function clamp(v: number) {
  let n = v
  if (props.min !== undefined) n = Math.max(props.min, n)
  if (props.max !== undefined) n = Math.min(props.max, n)
  return Number(n.toFixed(Math.max(props.digits, 4)))
}
function commit(v: number) {
  const n = clamp(v)
  emit('update:modelValue', n)
  emit('change', n)
}
function bump(dir: number) {
  commit(Number(props.modelValue) + dir * props.step)
}
// Long-press auto-repeat, matching GTK's spin button: fire once immediately,
// wait ~450ms, then repeat roughly every 70ms until release/leave.
let holdTimeout: ReturnType<typeof setTimeout> | null = null
let repeatInterval: ReturnType<typeof setInterval> | null = null
function clearRepeat() {
  if (holdTimeout) { clearTimeout(holdTimeout); holdTimeout = null }
  if (repeatInterval) { clearInterval(repeatInterval); repeatInterval = null }
}
function startHold(dir: number) {
  bump(dir)
  clearRepeat()
  holdTimeout = setTimeout(() => {
    repeatInterval = setInterval(() => bump(dir), 70)
  }, 450)
}
function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value
  const n = parseFloat(raw)
  if (!Number.isNaN(n)) {
    let v = n
    if (props.min !== undefined) v = Math.max(props.min, v)
    if (props.max !== undefined) v = Math.min(props.max, v)
    emit('update:modelValue', v)
  }
}
function onBlur(e: Event) {
  const n = parseFloat((e.target as HTMLInputElement).value)
  commit(Number.isNaN(n) ? 0 : n)
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    bump(1)
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    bump(-1)
  }
}
const atMin = computed(() => props.min !== undefined && props.modelValue <= props.min)
const atMax = computed(() => props.max !== undefined && props.modelValue >= props.max)
</script>

<template>
  <span class="rn-spin" :class="layout" :style="{ width: width + 'px' }">
    <!-- horizontal AdwSpinButton: [-] field [+] -->
    <template v-if="layout === 'horizontal'">
      <button type="button" class="spin-btn minus" :disabled="atMin"
        @pointerdown.prevent="startHold(-1)" @pointerup="clearRepeat" @pointerleave="clearRepeat" @pointercancel="clearRepeat">
        <RnoteIcon name="minus" />
      </button>
      <span class="spin-field">
        <input
          type="text"
          inputmode="decimal"
          :value="text"
          spellcheck="false"
          @input="onInput"
          @blur="onBlur"
          @keydown="onKey"
        />
        <span v-if="suffix" class="spin-suffix">{{ suffix }}</span>
      </span>
      <button type="button" class="spin-btn plus" :disabled="atMax"
        @pointerdown.prevent="startHold(1)" @pointerup="clearRepeat" @pointerleave="clearRepeat" @pointercancel="clearRepeat">
        <RnoteIcon name="plus" />
      </button>
    </template>
    <!-- vertical GtkSpinButton: field with stacked up/down arrows on the right -->
    <template v-else>
      <span class="spin-field">
        <input
          type="text"
          inputmode="decimal"
          :value="text"
          spellcheck="false"
          @input="onInput"
          @blur="onBlur"
          @keydown="onKey"
        />
        <span v-if="suffix" class="spin-suffix">{{ suffix }}</span>
      </span>
      <span class="spin-arrows">
        <button type="button" class="spin-btn up" :disabled="atMax"
          @pointerdown.prevent="startHold(1)" @pointerup="clearRepeat" @pointerleave="clearRepeat" @pointercancel="clearRepeat">
          <RnoteIcon name="chevron-up" />
        </button>
        <button type="button" class="spin-btn down" :disabled="atMin"
          @pointerdown.prevent="startHold(-1)" @pointerup="clearRepeat" @pointerleave="clearRepeat" @pointercancel="clearRepeat">
          <RnoteIcon name="chevron-down" />
        </button>
      </span>
    </template>
  </span>
</template>

<style scoped>
.rn-spin {
  display: inline-grid !important;
  grid-template-columns: 30px minmax(0, 1fr) 30px;
  align-items: stretch;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--input-bg);
  overflow: hidden;
}
/* vertical GtkSpinButton: field + a narrow column of stacked arrows */
.rn-spin.vertical {
  grid-template-columns: minmax(0, 1fr) 18px;
  height: 30px;
}
.spin-arrows {
  display: grid;
  grid-template-rows: 1fr 1fr;
  border-left: 1px solid var(--border);
}
.rn-spin.vertical .spin-btn {
  width: 18px;
}
.rn-spin.vertical .spin-btn svg {
  width: 13px;
  height: 13px;
}
.rn-spin.vertical .spin-field input {
  font-size: 12px;
}
.spin-btn {
  display: grid;
  place-items: center;
  width: 30px;
  border: none;
  background: transparent;
  color: var(--fg-muted);
  cursor: pointer;
  transition: background 0.13s ease, color 0.13s ease;
}
.spin-btn:hover {
  background: color-mix(in srgb, currentColor 9%, transparent);
  color: var(--fg);
}
.spin-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.spin-btn :deep(svg) {
  width: 15px;
  height: 15px;
}
.spin-field {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  overflow: hidden;
}
.spin-field input {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: var(--fg);
  font-family: inherit;
  font-size: 13px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  padding: 0 2px;
}
.spin-suffix {
  font-size: 11px;
  color: var(--fg-muted);
  padding-right: 7px;
  white-space: nowrap;
}
</style>
