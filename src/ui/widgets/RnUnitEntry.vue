<script setup lang="ts">
// RnUnitEntry (port of rnote-ui unitentry.rs): a numeric spinner linked with a
// measure-unit dropdown (Px / Mm / Cm). The bound modelValue is always in
// pixels; the displayed value is converted for the chosen unit using dpi.
import { ref, watch } from 'vue'
import RnNumberInput from './RnNumberInput.vue'
import RnSelect from './RnSelect.vue'

type Unit = 'px' | 'mm' | 'cm'
const props = withDefaults(
  defineProps<{
    modelValue: number
    dpi?: number
    min?: number
    max?: number
    step?: number
    digits?: number
    width?: number
  }>(),
  { dpi: 96, min: 0, max: 100000, step: 1, digits: 1, width: 100 }
)
const emit = defineEmits<{ 'update:modelValue': [number] }>()

const unit = ref<Unit>('px')
const display = ref(props.modelValue)
const unitOptions = [
  { value: 'px', label: 'Px' },
  { value: 'mm', label: 'Mm' },
  { value: 'cm', label: 'Cm' }
]

const MM_IN_INCH = 25.4
function toPx(value: number, u: Unit): number {
  if (u === 'px') return value
  if (u === 'mm') return (value / MM_IN_INCH) * props.dpi
  return ((value * 10) / MM_IN_INCH) * props.dpi
}
function fromPx(px: number, u: Unit): number {
  if (u === 'px') return px
  const mm = (px / props.dpi) * MM_IN_INCH
  return u === 'mm' ? mm : mm / 10
}
const rd = (v: number) => Math.round(v * 100) / 100

watch(unit, (nu, old) => {
  const px = toPx(display.value, old)
  display.value = rd(fromPx(px, nu))
})
watch(display, (v) => emit('update:modelValue', toPx(v, unit.value)))
watch(
  () => props.modelValue,
  (px) => {
    const cur = toPx(display.value, unit.value)
    if (Math.abs(cur - px) > 0.01) display.value = rd(fromPx(px, unit.value))
  }
)
</script>

<template>
  <div class="unit-entry">
    <RnNumberInput
      v-model="display"
      :min="min"
      :max="max"
      :step="step"
      :digits="digits"
      :width="width"
      class="ue-num"
    />
    <RnSelect v-model="unit" :options="unitOptions" :width="76" class="ue-unit" />
  </div>
</template>

<style scoped>
.unit-entry {
  display: inline-flex;
}
.ue-num :deep(.num-field) {
  border-radius: 8px 0 0 8px;
}
.ue-unit :deep(.select-trigger) {
  border-radius: 0 8px 8px 0;
  border-left: none;
}
</style>
