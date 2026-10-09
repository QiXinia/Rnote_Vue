<script setup lang="ts">
import { computed } from 'vue'
import RnNumberInput from '../widgets/RnNumberInput.vue'

const props = withDefaults(
  defineProps<{
    modelValue: number
    min?: number
    max?: number
    color?: string
    round?: boolean
  }>(),
  { min: 0.5, max: 60, color: '#000', round: false }
)
const emit = defineEmits<{ (e: 'update:modelValue', v: number): void }>()

const thickness = computed(() => Math.max(1, Math.min(48, props.modelValue)))
</script>

<template>
  <div class="swp">
    <div class="width-preview">
      <div
        class="line"
        :style="{
          height: thickness + 'px',
          background: color,
          borderRadius: round ? thickness + 'px' : '2px'
        }"
      ></div>
    </div>
    <RnNumberInput
      :model-value="modelValue"
      :min="min"
      :max="max"
      :step="0.5"
      :digits="1"
      :width="212"
      @update:model-value="emit('update:modelValue', Number($event))"
    />
  </div>
</template>

<style scoped>
.swp { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.width-preview {
  width: 100%;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--accent-bg);
}
.width-preview .line { width: 80%; min-width: 60px; }
</style>
