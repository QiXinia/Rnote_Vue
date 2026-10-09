<script setup lang="ts">
// AdwComboRow equivalent: title/subtitle with a trailing RnSelect.
import RnoteIcon from '../icons/RnoteIcon.vue'
import RnSelect, { type RnSelectOption } from './RnSelect.vue'
withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    icon?: string
    modelValue: string | number
    options: RnSelectOption[]
    width?: number
  }>(),
  { width: 180 }
)
const emit = defineEmits<{
  (e: 'update:modelValue', v: string | number): void
  (e: 'change', v: string | number): void
}>()
</script>

<template>
  <div class="combo-row">
    <RnoteIcon v-if="icon" :name="icon" class="row-leading" />
    <span class="row-titles">
      <span class="row-title">{{ title }}</span>
      <span v-if="subtitle" class="row-subtitle">{{ subtitle }}</span>
    </span>
    <RnSelect
      :model-value="modelValue"
      :options="options"
      :width="width"
      @update:model-value="emit('update:modelValue', $event)"
      @change="emit('change', $event)"
    />
  </div>
</template>

<style scoped>
.combo-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 9px 12px;
}
.row-leading {
  width: 20px;
  height: 20px;
  color: var(--fg-muted);
  flex: 0 0 auto;
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
