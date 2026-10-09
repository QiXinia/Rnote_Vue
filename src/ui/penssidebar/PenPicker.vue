<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../../stores/app'
import { PenStyle, PenMode } from '../../engine/pens/pensconfig'
import RnoteIcon from '../icons/RnoteIcon.vue'

const store = useAppStore()
const { t } = useI18n()
// currentPen is a non-reactive engine field; re-evaluate on every ui change.
const tick = computed(() => store.uiTick)

const tools = [
  { pen: PenStyle.Brush, icon: 'brush', label: 'Brush' },
  { pen: PenStyle.Shaper, icon: 'shaper', label: 'Shaper' },
  { pen: PenStyle.Typewriter, icon: 'typewriter', label: 'Typewriter' },
  { pen: PenStyle.Eraser, icon: 'eraser', label: 'Eraser' },
  { pen: PenStyle.Selector, icon: 'selector', label: 'Selector' },
  { pen: PenStyle.Tools, icon: 'tools', label: 'Tools' }
]

function isActive(pen: PenStyle) {
  void tick.value
  const e = store.engine
  if (!e) return false
  if (pen === PenStyle.Eraser) return e.currentPen === PenStyle.Eraser || e.penMode === PenMode.Eraser
  return e.currentPen === pen && e.penMode !== PenMode.Eraser
}
</script>

<template>
  <nav class="penpicker">
    <div class="section">
      <button
        v-for="tool in tools"
        :key="tool.pen"
        class="btn"
        :class="{ toggled: isActive(tool.pen) }"
        :title="t(tool.label)"
        @click="store.setPen(tool.pen)"
      >
        <RnoteIcon :name="tool.icon" />
      </button>
    </div>
    <div class="divider"></div>
    <div class="section">
      <button class="btn" :title="t('Undo')" @click="store.engine?.history.undo()"><RnoteIcon name="undo" /></button>
      <button class="btn" :title="t('Redo')" @click="store.engine?.history.redo()"><RnoteIcon name="redo" /></button>
    </div>
  </nav>
</template>
