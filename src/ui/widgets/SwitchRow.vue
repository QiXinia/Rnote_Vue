<script setup lang="ts">
// AdwSwitchRow equivalent: title/subtitle with a trailing RnSwitch.
import RnSwitch from './RnSwitch.vue'
const props = defineProps<{
  title: string
  subtitle?: string
  icon?: string
  modelValue: boolean
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'change', v: boolean): void
}>()
</script>

<template>
  <div class="switch-row">
    <RnoteIcon v-if="icon" :name="icon" class="row-leading" />
    <span class="row-titles">
      <span class="row-title">{{ title }}</span>
      <span v-if="subtitle" class="row-subtitle">{{ subtitle }}</span>
    </span>
    <RnSwitch
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event)"
      @change="emit('change', $event)"
    />
  </div>
</template>

<style scoped>
.switch-row {
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
