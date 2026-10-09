<script setup lang="ts">
// Custom drop-down, porting libadwaita's AdwComboRow: a trigger showing the
// current value and a popover list of options. Replaces native <select>.
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import RnoteIcon from '../icons/RnoteIcon.vue'

export interface RnSelectOption {
  value: string | number
  label: string
  icon?: string
}
const props = withDefaults(
  defineProps<{
    modelValue: string | number
    options: RnSelectOption[]
    placeholder?: string
    disabled?: boolean
    width?: number
  }>(),
  { disabled: false, width: 220 }
)
const emit = defineEmits<{
  (e: 'update:modelValue', v: string | number): void
  (e: 'change', v: string | number): void
}>()

const open = ref(false)
const triggerEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
const popStyle = ref<Record<string, string>>({})

const selected = ref<RnSelectOption | undefined>(undefined)
function syncSelected() {
  selected.value = props.options.find((o) => o.value === props.modelValue)
}
syncSelected()

const CloseName = 'rnote:close-popovers'
function closeFromEvent(e: Event) {
  // Ignore a close request that originates inside our own panel (e.g. a nested
  // control opening inside us must not close us).
  const src = (e as CustomEvent).detail as HTMLElement | undefined
  if (src && panelEl.value && panelEl.value.contains(src)) return
  open.value = false
}
onMounted(() => {
  window.addEventListener(CloseName, closeFromEvent)
  syncSelected()
})
onBeforeUnmount(() => window.removeEventListener(CloseName, closeFromEvent))

async function toggle() {
  if (props.disabled) return
  if (!open.value) window.dispatchEvent(new CustomEvent(CloseName, { detail: triggerEl.value }))
  open.value = !open.value
  if (open.value) {
    syncSelected()
    await nextTick()
    const r = triggerEl.value!.getBoundingClientRect()
    const pw = props.width
    const ph = panelEl.value?.offsetHeight ?? 60
    let top = r.bottom + 6
    if (top + ph > window.innerHeight - 8) top = r.top - ph - 6
    let left = r.left
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8))
    popStyle.value = { left: `${left}px`, top: `${Math.max(8, top)}px`, width: `${pw}px` }
  }
}
function choose(o: RnSelectOption) {
  emit('update:modelValue', o.value)
  emit('change', o.value)
  selected.value = o
  open.value = false
}
function onKey(e: KeyboardEvent) {
  if (!open.value && (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown')) {
    e.preventDefault()
    toggle()
  }
}
defineExpose({ close: () => (open.value = false) })
</script>

<template>
  <button
    ref="triggerEl"
    type="button"
    class="rn-select"
    :class="{ open, disabled }"
    :style="{ width: width + 'px' }"
    @click.stop="toggle"
    @keydown="onKey"
  >
    <RnoteIcon v-if="selected?.icon" :name="selected.icon" class="sel-icon" />
    <span class="sel-label" :class="{ ph: !selected }">{{
      selected ? selected.label : (placeholder ?? '—')
    }}</span>
    <RnoteIcon name="chevron-down" class="sel-chevron" />
  </button>
  <Teleport to="body">
    <template v-if="open">
      <div class="popover-backdrop" @click.stop="open = false" @contextmenu.prevent="open = false"></div>
      <div ref="panelEl" class="rn-select-pop" :style="popStyle" @click.stop>
        <button
          v-for="o in options"
          :key="String(o.value)"
          type="button"
          class="rn-option"
          :data-value="String(o.value)"
          :class="{ active: o.value === modelValue }"
          @click="choose(o)"
        >
          <RnoteIcon v-if="o.icon" :name="o.icon" class="opt-icon" />
          <span class="opt-label">{{ o.label }}</span>
          <RnoteIcon v-if="o.value === modelValue" name="check" class="opt-check" />
        </button>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.rn-select {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--fg);
  cursor: pointer;
  font-size: 13px;
  transition: border-color 0.14s ease, background 0.14s ease;
}
.rn-select:hover {
  border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
}
.rn-select.open {
  border-color: var(--accent);
}
.rn-select .sel-label {
  flex: 1;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rn-select .sel-label.ph {
  color: var(--fg-faint);
}
.rn-select .sel-chevron {
  width: 16px;
  height: 16px;
  color: var(--fg-muted);
  transition: transform 0.16s ease;
}
.rn-select.open .sel-chevron {
  transform: rotate(180deg);
}
.rn-select .sel-icon {
  width: 17px;
  height: 17px;
}
.rn-select.disabled {
  opacity: 0.5;
  cursor: default;
}
.rn-select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}
.rn-select-pop {
  position: fixed;
  z-index: 130;
  background: var(--popover-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow-pop);
  padding: 6px;
  max-height: 60vh;
  overflow-y: auto;
}
.rn-option {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 9px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--fg);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}
.rn-option:hover {
  background: color-mix(in srgb, currentColor 8%, transparent);
}
.rn-option:active {
  background: color-mix(in srgb, currentColor 15%, transparent);
}
.rn-option .opt-label {
  flex: 1;
}
.rn-option .opt-icon {
  width: 17px;
  height: 17px;
}
.rn-option .opt-check {
  width: 16px;
  height: 16px;
  color: var(--accent);
}
</style>
