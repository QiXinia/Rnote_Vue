<script setup lang="ts">
import { computed, ref } from 'vue'
import { Teleport } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../../stores/app'
import RnoteIcon from '../icons/RnoteIcon.vue'

const store = useAppStore()
const { t } = useI18n()

// Right-click tab menu, porting the adw TabView menu-model (Move Left/Right,
// Close; "Move to New Window" is desktop-only and omitted on the web).
const menu = ref<{ id: number; x: number; y: number } | null>(null)
const menuEl = ref<HTMLElement | null>(null)

function openMenu(e: MouseEvent, id: number) {
  if (id !== store.activeId) store.selectTab(id)
  menu.value = { id, x: e.clientX, y: e.clientY }
}
function closeMenu() {
  menu.value = null
}
function move(dir: -1 | 1) {
  if (menu.value) store.moveTab(menu.value.id, dir)
  closeMenu()
}
function close() {
  const id = menu.value?.id
  closeMenu()
  if (id != null) store.closeTab(id)
}
const menuPos = computed(() => {
  if (!menu.value) return {}
  const w = 176
  const h = 112
  let x = menu.value.x
  let y = menu.value.y
  if (x + w > window.innerWidth - 6) x = window.innerWidth - w - 6
  if (y + h > window.innerHeight - 6) y = window.innerHeight - h - 6
  return { left: `${x}px`, top: `${y}px` }
})
function menuState(id: number) {
  const n = store.tabs.length
  const pos = store.tabs.findIndex((t) => t.id === id)
  return { canLeft: pos > 0, canRight: pos + 1 < n, canClose: n > 1 }
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeMenu()
}

// Drag-to-reorder, porting AdwTabView's tab drag reordering.
const dragId = ref<number | null>(null)
const dragOverId = ref<number | null>(null)
function onDragStart(e: DragEvent, id: number) {
  dragId.value = id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(id))
  }
}
function onDragOver(e: DragEvent, id: number) {
  if (dragId.value == null) return
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOverId.value = id
}
function onDragLeave(id: number) {
  if (dragOverId.value === id) dragOverId.value = null
}
function onDrop(_e: DragEvent, id: number) {
  if (dragId.value != null) store.reorderTab(dragId.value, id)
  dragId.value = null
  dragOverId.value = null
}
function onDragEnd() {
  dragId.value = null
  dragOverId.value = null
}
</script>

<template>
  <div class="tab-bar">
    <div class="tab-scroll">
      <button
        v-for="tab in store.tabs"
        :key="tab.id"
        class="tab-page"
        :class="{ active: tab.id === store.activeId, 'drag-over': dragOverId === tab.id && dragId !== tab.id }"
        draggable="true"
        @click="store.selectTab(tab.id)"
        @contextmenu.prevent="openMenu($event, tab.id)"
        @dragstart="onDragStart($event, tab.id)"
        @dragover.prevent="onDragOver($event, tab.id)"
        @dragleave="onDragLeave(tab.id)"
        @drop.prevent="onDrop($event, tab.id)"
        @dragend="onDragEnd"
      >
        <RnoteIcon v-if="tab.dirty" name="dot" class="tab-dot" />
        <span class="tab-title">{{ tab.name === 'New Document' ? t('New Document') : tab.name }}</span>
        <span class="tab-close" @click.stop="store.closeTab(tab.id)">
          <RnoteIcon name="window-close" />
        </span>
      </button>
    </div>
    <button class="tab-new" v-tip="t('New Tab')" @click="store.newTab()">
      <RnoteIcon name="plus" />
    </button>
  </div>

  <Teleport to="body">
    <template v-if="menu">
      <div class="tab-cx-backdrop" @click="closeMenu" @contextmenu.prevent="closeMenu"></div>
      <div ref="menuEl" class="tab-cx-menu" role="menu" tabindex="-1" :style="menuPos" @keydown="onKeydown">
        <div class="tab-cx-section">
          <button
            type="button"
            class="tab-cx-item"
            :disabled="!menuState(menu.id).canLeft"
            @click="move(-1)"
          >{{ t('Move Left') }}</button>
          <button
            type="button"
            class="tab-cx-item"
            :disabled="!menuState(menu.id).canRight"
            @click="move(1)"
          >{{ t('Move Right') }}</button>
        </div>
        <div class="tab-cx-sep"></div>
        <div class="tab-cx-section">
          <button
            type="button"
            class="tab-cx-item"
            :disabled="!menuState(menu.id).canClose"
            @click="close"
          >{{ t('Close') }}</button>
        </div>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.tab-cx-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
}
.tab-cx-menu {
  position: fixed;
  z-index: 121;
  min-width: 168px;
  padding: 4px;
  background: var(--popover-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-pop);
  outline: none;
}
.tab-cx-section {
  display: flex;
  flex-direction: column;
}
.tab-cx-item {
  text-align: start;
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--fg);
  font-size: 13px;
  cursor: pointer;
}
.tab-cx-item:hover:not(:disabled) {
  background: var(--hover-bg);
}
.tab-cx-item:disabled {
  opacity: 0.45;
  cursor: default;
}
.tab-cx-sep {
  height: 1px;
  margin: 4px 8px;
  background: var(--border);
}
</style>
