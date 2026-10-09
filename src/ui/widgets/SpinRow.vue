<script setup lang="ts">
// AdwSpinRow equivalent: title/subtitle with a trailing RnNumberInput.
import RnoteIcon from '../icons/RnoteIcon.vue'
import RnNumberInput from './RnNumberInput.vue'
withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    icon?: string
    modelValue: number
    min?: number
    max?: number
    step?: number
    digits?: number
    suffix?: string
    width?: number
  }>(),
  { width: 130 }
)
const emit = defineEmits<{
  (e: 'update:modelValue', v: number): void
  (e: 'change', v: number): void
}>()
</script>

<template>
  <div class="spin-row">
    <RnoteIcon v-if="icon" :name="icon" class="row-leading" />
    <span class="row-titles">
      <span class="row-title">{{ title }}</span>
      <span v-if="subtitle" class="row-subtitle">{{ subtitle }}</span>
    </span>
    <RnNumberInput
      :model-value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      :digits="digits"
      :suffix="suffix"
      :width="width"
      @update:model-value="emit('update:modelValue', $event)"
      @change="emit('change', $event)"
    />
  </div>
</template>

<style scoped>
.spin-row {
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
