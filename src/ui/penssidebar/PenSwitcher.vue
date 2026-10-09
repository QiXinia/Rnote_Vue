<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../../stores/app'
import { PenStyle, PenMode } from '../../engine/pens/pensconfig'
import RnoteIcon from '../icons/RnoteIcon.vue'

const store = useAppStore()
const { t } = useI18n()
// re-evaluate active state whenever the engine notifies a config change
const tick = computed(() => store.uiTick)

function isActive(pen: PenStyle) {
  void tick.value
  const e = store.engine
  if (!e) return false
  if (pen === PenStyle.Eraser) return e.currentPen === PenStyle.Eraser || e.penMode === PenMode.Eraser
  return e.currentPen === pen && e.penMode !== PenMode.Eraser
}

const tools = [
  { pen: PenStyle.Brush, icon: 'brush', label: 'Brush' },
  { pen: PenStyle.Shaper, icon: 'shaper', label: 'Shaper' },
  { pen: PenStyle.Typewriter, icon: 'typewriter', label: 'Typewriter' },
  { pen: PenStyle.Eraser, icon: 'eraser', label: 'Eraser' },
  { pen: PenStyle.Selector, icon: 'selector-rectangle', label: 'Selector' },
  { pen: PenStyle.Tools, icon: 'tools', label: 'Tools' }
]
</script>

<template>
  <div class="pen-switcher">
    <button
      v-for="tool in tools"
      :key="tool.pen"
      class="switcher-btn"
      :class="{ active: isActive(tool.pen) }"
      v-tip="t(tool.label)"
      @click="store.setPen(tool.pen)"
    >
      <RnoteIcon :name="tool.icon" />
    </button>
    <span class="switcher-sep"></span>
    <button
      class="switcher-btn"
      :class="{ active: store.sidebarOpen }"
      v-tip="t('Toggle pen options sidebar')"
      @click="store.toggleSidebar()"
    ><RnoteIcon name="settings" /></button>
    <button class="switcher-btn" :disabled="!store.engine?.history.canUndo" v-tip="t('Undo')" @click="store.engine?.history.undo()"><RnoteIcon name="undo" /></button>
    <button class="switcher-btn" :disabled="!store.engine?.history.canRedo" v-tip="t('Redo')" @click="store.engine?.history.redo()"><RnoteIcon name="redo" /></button>
  </div>
</template>

<style scoped>
.pen-switcher {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 50px;
  padding: 4px 6px;
  border-radius: 12px;
  background: var(--popover-bg, var(--sidebar-bg));
  border: 1px solid rgba(0, 0, 0, 0.12);
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.18);
  min-width: 432px;
}
.pen-switcher::before {
  content: '';
}
.pen-switcher > .switcher-btn:nth-child(-n + 6) {
  flex: 1 1 0;
  width: 52px;
}
.switcher-btn {
  width: 40px;
  height: 38px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: transparent;
  border: none;
  color: var(--fg);
  cursor: pointer;
  transition: background 0.12s ease;
  padding: 0;
}
.switcher-btn:hover {
  background: var(--button-flat-hover);
}
.switcher-btn.active {
  background: var(--checked-bg);
  color: var(--checked-fg);
}
.switcher-btn.active:hover {
  background: var(--checked-bg-hover);
}
.switcher-btn:disabled {
  opacity: 0.38;
}
.switcher-btn:disabled:hover {
  background: transparent;
}
.switcher-btn :deep(svg) {
  width: 21px;
  height: 21px;
}
.switcher-sep {
  width: 1px;
  height: 28px;
  background: var(--border-strong);
  margin: 0 2px;
  opacity: 0.7;
}
</style>
