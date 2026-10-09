<script setup lang="ts">
// Custom switch, porting libadwaita's AdwSwitch (pill + sliding thumb).
// Replaces native checkboxes used as boolean toggles.
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
    class="rn-switch"
    :class="{ checked: modelValue, disabled }"
    role="switch"
    :aria-checked="modelValue"
    tabindex="0"
    @click="toggle"
    @keydown="onKey"
  ><span class="thumb"></span
  ></span>
</template>

<style scoped>
.rn-switch {
  position: relative;
  display: inline-block;
  width: 46px;
  height: 26px;
  border-radius: 13px;
  background: color-mix(in srgb, var(--fg) 30%, transparent);
  cursor: pointer;
  flex: 0 0 auto;
  transition: background 0.18s ease;
  outline: none;
}
.rn-switch .thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35);
  transition: transform 0.18s cubic-bezier(0.34, 1.3, 0.64, 1);
}
.rn-switch.checked {
  background: var(--accent);
}
.rn-switch.checked .thumb {
  transform: translateX(20px);
}
.rn-switch:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.rn-switch.disabled {
  opacity: 0.5;
  cursor: default;
}
:root[data-theme='dark'] .rn-switch:not(.checked) {
  background: color-mix(in srgb, var(--fg) 40%, transparent);
}
</style>
