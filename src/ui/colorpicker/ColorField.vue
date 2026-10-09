<script setup lang="ts">
import { computed } from 'vue'
import { Color } from '../../compose/style/color'
import Popover from '../menus/Popover.vue'
import ColorDialog from '../widgets/ColorDialog.vue'

// A self-contained color field with alpha support, mirroring GTK's
// GtkColorDialogButton. Opens the shared self-drawn ColorDialog.
const props = defineProps<{ modelValue: Color }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: Color): void }>()

const current = computed(() => props.modelValue ?? Color.BLACK)
// Foreground / indicator color, same rule as colorpad.rs:
//   alpha == 0 -> @window_fg_color; dark bg -> @light_1; light bg -> @dark_5
function padFg(c: Color) {
  if (c.a === 0) return 'var(--fg)'
  return c.luma() < 0.7 ? '#ffffff' : '#77767b'
}
</script>

<template>
  <Popover align="right" button-class="color-field-trigger" :panel-width="312">
    <template #trigger="{ open }">
      <span class="color-swatch" :class="{ checked: open }" :style="{ backgroundColor: current.toCss(), color: padFg(current) }">
        <span v-if="current.a === 0" class="no-color-slash"></span>
      </span>
    </template>
    <ColorDialog :model-value="current" :with-alpha="true" @update:model-value="emit('update:modelValue', $event)" />
  </Popover>
</template>

<style scoped>
:deep(.color-field-trigger) {
  width: auto;
  min-width: 0;
  height: auto;
  padding: 0;
  margin: 0;
  background: transparent;
  border: 0;
  border-radius: 6px;
}
.color-swatch {
  position: relative;
  display: block;
  width: 42px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background-blend-mode: screen;
  background-image:
    linear-gradient(45deg, rgba(15, 15, 15, 0.28) 25%, transparent 25%, transparent 75%, rgba(15, 15, 15, 0.28) 75%, rgba(15, 15, 15, 0.28)),
    linear-gradient(45deg, rgba(15, 15, 15, 0.28) 25%, transparent 25%, transparent 75%, rgba(15, 15, 15, 0.28) 75%, rgba(15, 15, 15, 0.28));
  background-size: 16px 16px;
  background-position: 0 0, 8px 8px;
}
.color-swatch.checked {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.no-color-slash::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 32px;
  height: 2px;
  background: #c01c28;
  transform: translate(-50%, -50%) rotate(-45deg);
}
</style>
