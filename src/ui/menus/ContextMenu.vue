<script setup lang="ts">
// Canvas right-click context menu, porting the GTK PopoverMenu in
// contextmenu.ui. The desktop menu items are text-only (no icons) with an
// accelerator hint on the right, and the popover is keyboard navigable
// (arrows + Enter, Esc to dismiss).
import { computed, ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../../stores/app'
import { Vec2 } from '../../compose/geometry'

const store = useAppStore()
const { t } = useI18n()

const hasSelection = computed(() => (store.engine?.store.selectedStrokes().length ?? 0) > 0)
const hasClipboard = computed(() => (store.engine?.clipboard.length ?? 0) > 0)

function close() {
  store.closeContextMenu()
}
function copy() {
  store.engine?.copySelection(false)
  close()
}
function cut() {
  store.engine?.copySelection(true)
  store.bump()
  close()
}
function paste() {
  const m = store.contextMenu
  store.engine?.paste(new Vec2(m.docX, m.docY))
  store.bump()
  close()
}

const items = computed(() => [
  { label: t('_Copy'), accel: 'Ctrl+C', disabled: !hasSelection.value, run: copy },
  { label: t('C_ut'), accel: 'Ctrl+X', disabled: !hasSelection.value, run: cut },
  { label: t('_Paste'), accel: 'Ctrl+V', disabled: !hasClipboard.value, run: paste }
])

const activeIndex = ref(0)
const menuEl = ref<HTMLElement | null>(null)

function firstEnabled(): number {
  const idx = items.value.findIndex((i) => !i.disabled)
  return idx < 0 ? 0 : idx
}
watch(
  () => store.contextMenu.open,
  async (open) => {
    if (open) {
      activeIndex.value = firstEnabled()
      await nextTick()
      menuEl.value?.focus()
    }
  }
)

function onKeydown(e: KeyboardEvent) {
  const n = items.value.length
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const dir = e.key === 'ArrowDown' ? 1 : -1
    let i = activeIndex.value
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n
      if (!items.value[i].disabled) break
    }
    activeIndex.value = i
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    const it = items.value[activeIndex.value]
    if (it && !it.disabled) it.run()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    close()
  }
}

const pos = computed(() => {
  const m = store.contextMenu
  const w = 188
  const h = 118
  let x = m.x
  let y = m.y
  if (x + w > window.innerWidth - 8) x = window.innerWidth - w - 8
  if (y + h > window.innerHeight - 8) y = window.innerHeight - h - 8
  return { left: `${Math.max(8, x)}px`, top: `${Math.max(8, y)}px` }
})
</script>

<template>
  <Teleport to="body">
    <template v-if="store.contextMenu.open">
      <div class="ctx-backdrop" @click="close" @contextmenu.prevent="close"></div>
      <div
        ref="menuEl"
        class="ctx-menu"
        role="menu"
        tabindex="-1"
        :style="pos"
        @keydown="onKeydown"
      >
        <button
          v-for="(it, i) in items"
          :key="it.label"
          type="button"
          role="menuitem"
          class="ctx-item"
          :class="{ active: i === activeIndex, disabled: it.disabled }"
          :disabled="it.disabled"
          @mouseenter="activeIndex = i"
          @click="it.run()"
        >
          <span class="ctx-label">{{ it.label }}</span>
          <span class="ctx-accel">{{ it.accel }}</span>
        </button>
      </div>
    </template>
  </Teleport>
</template>

<style scoped>
.ctx-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
}
.ctx-menu {
  position: fixed;
  z-index: 121;
  min-width: 176px;
  padding: 4px;
  background: var(--popover-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow-pop);
  outline: none;
}
.ctx-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--fg);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.ctx-item.active:not(.disabled) {
  background: var(--accent-bg);
  color: var(--accent-fg, var(--fg));
}
.ctx-item.disabled {
  opacity: 0.4;
  cursor: default;
}
.ctx-label {
  flex: 1;
}
.ctx-accel {
  margin-left: 24px;
  color: var(--fg-muted);
  font-size: 12px;
}
.ctx-item.active:not(.disabled) .ctx-accel {
  color: var(--accent-fg, var(--fg-muted));
}
</style>
