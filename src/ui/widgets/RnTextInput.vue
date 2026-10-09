<script setup lang="ts">
// Custom text entry, porting GTK4's GtkEntry (rounded, bordered, focus ring).
// Replaces native <input type="text"> for consistent styling.
withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    disabled?: boolean
    monospace?: boolean
    type?: string
  }>(),
  { disabled: false, monospace: false, type: 'text' }
)
const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'change', v: string): void
  (e: 'enter'): void
}>()
function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}
function onBlur(e: Event) {
  emit('change', (e.target as HTMLInputElement).value)
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter') emit('enter')
}
</script>

<template>
  <input
    class="rn-text"
    :class="{ monospace }"
    :type="type"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    spellcheck="false"
    @input="onInput"
    @blur="onBlur"
    @keydown="onKey"
  />
</template>

<style scoped>
.rn-text {
  height: 34px;
  width: 100%;
  min-width: 0;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--fg);
  font-family: inherit;
  font-size: 13px;
  transition: border-color 0.14s ease, box-shadow 0.14s ease;
}
.rn-text::placeholder {
  color: var(--fg-faint);
}
.rn-text:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent);
}
.rn-text:disabled {
  opacity: 0.5;
}
.rn-text.monospace {
  font-family: 'Source Code Pro', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
