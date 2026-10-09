<script setup lang="ts">
// AdwActionRow equivalent: a titled row with an optional subtitle, leading
// icon and a trailing suffix slot.
import RnoteIcon from '../icons/RnoteIcon.vue'
withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    icon?: string
    activatable?: boolean
  }>(),
  { activatable: false }
)
const emit = defineEmits<{ (e: 'activated'): void }>()
</script>

<template>
  <div class="action-row" :class="{ activatable }" @click="activatable && emit('activated')">
    <RnoteIcon v-if="icon" :name="icon" class="row-leading" />
    <span class="row-titles">
      <span class="row-title">{{ title }}</span>
      <span v-if="subtitle" class="row-subtitle">{{ subtitle }}</span>
    </span>
    <span class="row-suffix"><slot name="suffix" /></span>
  </div>
</template>

<style scoped>
.action-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  padding: 9px 12px;
}
.action-row.activatable {
  cursor: pointer;
}
.action-row.activatable:hover {
  background: color-mix(in srgb, currentColor 7%, transparent);
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
  color: var(--fg);
}
.row-subtitle {
  font-size: 11.5px;
  color: var(--fg-muted);
  margin-top: 1px;
}
.row-suffix {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}
</style>
