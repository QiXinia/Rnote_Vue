<script setup lang="ts">
// Custom check button, porting GTK4's GtkCheckButton box + check mark.
// Replaces native <input type="checkbox"> for non-switch boolean options.
import RnoteIcon from '../icons/RnoteIcon.vue'
const props = withDefaults(
  defineProps<{ modelValue: boolean; disabled?: boolean }>(),
  { disabled: false }
)
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'change', v: boolean): void
}>()
function toggle() {
  if (props.disabled) return
  const v = !props.modelValue
  emit('update:modelValue', v)
  emit('change', v)
}
function onKey(e: KeyboardEvent) {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    toggle()
  }
}
</script>

<template>
  <span
    class="rn-checkbox"
    :class="{ checked: modelValue, disabled }"
    role="checkbox"
    :aria-checked="modelValue"
    tabindex="0"
    @click="toggle"
    @keydown="onKey"
  >
    <RnoteIcon v-if="modelValue" name="check" class="tick" />
  </span>
</template>

<style scoped>
.rn-checkbox {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 1.5px solid color-mix(in srgb, var(--fg) 42%, transparent);
  background: transparent;
  cursor: pointer;
  flex: 0 0 auto;
  transition: background 0.14s ease, border-color 0.14s ease;
  outline: none;
}
.rn-checkbox.checked {
  background: var(--accent);
  border-color: var(--accent);
}
.rn-checkbox .tick {
  width: 13px;
  height: 13px;
  color: #fff;
}
.rn-checkbox .tick :deep(svg) {
  stroke-width: 2.4;
}
.rn-checkbox:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.rn-checkbox.disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
