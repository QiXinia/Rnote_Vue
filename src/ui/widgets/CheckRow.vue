<script setup lang="ts">
// Labelled check row: RnCheckbox on the leading side with title/subtitle.
// Clicking anywhere on the row toggles the value (as in GTK list rows).
import RnCheckbox from './RnCheckbox.vue'
const props = defineProps<{
  title: string
  subtitle?: string
  modelValue: boolean
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'change', v: boolean): void
}>()
function toggle() {
  emit('update:modelValue', !props.modelValue)
  emit('change', !props.modelValue)
}
</script>

<template>
  <div class="check-row" @click="toggle">
    <RnCheckbox
      :model-value="modelValue"
      @click.stop
      @update:model-value="emit('update:modelValue', $event)"
    />
    <span class="row-titles">
      <span class="row-title">{{ title }}</span>
      <span v-if="subtitle" class="row-subtitle">{{ subtitle }}</span>
    </span>
  </div>
</template>

<style scoped>
.check-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 46px;
  padding: 9px 12px;
  cursor: pointer;
  border-radius: 8px;
}
.check-row:hover {
  background: color-mix(in srgb, currentColor 7%, transparent);
}
.row-titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.row-title {
  font-size: 13.5px;
}
.row-subtitle {
  font-size: 11.5px;
  color: var(--fg-muted);
  margin-top: 1px;
}
</style>
