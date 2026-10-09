<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../../stores/app'
import RnoteIcon from '../icons/RnoteIcon.vue'
import Popover from '../menus/Popover.vue'
import { Layout } from '../../engine/document/layout'

const store = useAppStore()
const { t } = useI18n()

const docName = computed(() => {
  const n = store.activeTab?.name
  if (!n) return t('New Document')
  return n === 'Untitled Rnote' ? t('Untitled Rnote') : n
})
const zoomLabel = computed(() => `${store.engine?.camera.zoomPercent ?? 100}%`)

function undo() {
  store.engine?.history.undo()
}
function redo() {
  store.engine?.history.redo()
}
function newTab() {
  store.newTab()
}
function addPage() {
  store.engine?.document.addPage()
  store.engine?.notify()
}
function removePage() {
  store.engine?.document.removePage()
  store.engine?.notify()
}
function zoomIn() {
  store.engine?.camera.zoomIn()
  store.bump()
}
function zoomOut() {
  store.engine?.camera.zoomOut()
  store.bump()
}
function zoomReset() {
  store.engine?.camera.reset()
  store.bump()
}
function fitWidth() {
  const e = store.engine
  if (!e) return
  const bounds = e.contentBounds() ?? e.document.pageBounds(0)
  e.camera.fitWidth(bounds)
  store.bump()
}
function realSize() {
  store.engine?.camera.realSize()
  store.bump()
}
function toggleSetting(key: 'snapPositions' | 'respectBordersWhenPasting' | 'penSounds' | 'touchDrawing' | 'blockPinchZoom') {
  const e = store.engine
  if (!e) return
  e.settings[key] = !e.settings[key]
  e.notify()
}
</script>

<template>
  <div class="header-wrap">
    <header class="headerbar">
      <div class="hdr-left">
        <button class="btn header-icon" :class="{ toggled: store.workspaceOpen }" v-tip="t('Toggle workspace sidebar')" @click="store.toggleWorkspace()">
          <RnoteIcon name="workspaces" />
        </button>
        <button class="btn header-icon" v-tip="t('New Tab')" @click="newTab"><RnoteIcon name="plus" /></button>
        <Popover icon="tab-overview" button-class="header-icon" align="left">
          <div class="tab-overview-menu">
            <div class="menu-section-label">{{ t('Documents') }}</div>
            <button
              v-for="tab in store.tabs"
              :key="tab.id"
              class="menu-item"
              :class="{ active: tab.id === store.activeId }"
              @click="store.selectTab(tab.id)"
            >
              <RnoteIcon name="file" class="sm" />
              <span class="menu-text">{{ tab.name }}</span>
              <span v-if="tab.dirty" class="dirty-inline">●</span>
            </button>
            <div class="menu-separator"></div>
            <button class="menu-item" @click="newTab"><RnoteIcon name="tab-new" class="sm" /><span class="menu-text">{{ t('New Tab') }}</span></button>
          </div>
        </Popover>
        <button class="btn header-icon" :class="{ toggled: store.focusMode }" v-tip="t('Focus Mode')" @click="store.toggleFocus()">
          <RnoteIcon name="focus" />
        </button>
      </div>

      <div class="hdr-center">
        <span v-if="store.activeTab?.dirty" class="unsaved-bullet" :title="t('Unsaved changes')">●</span>
        <div class="title-stack">
          <div class="doc-title">{{ docName }}</div>
          <div class="doc-subtitle">{{ t('Draft') }}</div>
        </div>
      </div>

      <div class="hdr-right">
        <button class="btn header-icon" v-tip="t('Save')" @click="store.saveDocument(false)"><RnoteIcon name="save" /></button>
        <button class="btn header-icon" :class="{ toggled: store.sidebarOpen }" v-tip="t('Toggle pen options sidebar')" @click="store.toggleSidebar()">
          <RnoteIcon name="sidebar" />
        </button>

        <Popover icon="canvasmenu" button-class="header-icon" align="right">
          <div class="canvas-menu">
            <div class="zoom-quickrow">
              <button class="btn" v-tip="t('Zoom out')" @click="zoomOut"><RnoteIcon name="zoom-out" /></button>
              <button class="btn zoom-reset" @click="zoomReset">{{ zoomLabel }}</button>
              <button class="btn" v-tip="t('Zoom in')" @click="zoomIn"><RnoteIcon name="zoom-in" /></button>
              <button class="btn" v-tip="t('Zoom to Page Width')" @click="fitWidth"><RnoteIcon name="fit-width" /></button>
              <button class="btn" v-tip="t('Zoom to Real Size')" @click="realSize"><RnoteIcon name="real-size" /></button>
            </div>
            <div v-if="store.engine?.document.layout === Layout.FixedSize" class="page-quickrow">
              <button class="btn" v-tip="t('Remove Page')" @click="removePage"><RnoteIcon name="page-remove" /></button>
              <button class="btn" v-tip="t('Add Page')" @click="addPage"><RnoteIcon name="page-add" /></button>
            </div>
            <div class="menu-separator"></div>
            <button class="menu-item" @click="toggleSetting('snapPositions')"><span class="menu-text">{{ t('Snap Positions') }}</span><span class="accel">{{ store.engine?.settings.snapPositions ? '✓' : '' }}</span></button>
            <button class="menu-item" @click="toggleSetting('respectBordersWhenPasting')"><span class="menu-text">{{ t('Respect Borders When Pasting') }}</span><span class="accel">{{ store.engine?.settings.respectBordersWhenPasting ? '✓' : '' }}</span></button>
            <button class="menu-item" @click="toggleSetting('penSounds')"><span class="menu-text">{{ t('_Pen Sounds') }}</span><span class="accel">{{ store.engine?.settings.penSounds ? '✓' : '' }}</span></button>
            <button class="menu-item" @click="toggleSetting('touchDrawing')"><span class="menu-text">{{ t('Draw With _Touch Input') }}</span><span class="accel">{{ store.engine?.settings.touchDrawing ? '✓' : '' }}</span></button>
            <button class="menu-item" @click="toggleSetting('blockPinchZoom')"><span class="menu-text">{{ t('Block Pinch to _Zoom') }}</span><span class="accel">{{ store.engine?.settings.blockPinchZoom ? '✓' : '' }}</span></button>
            <div class="menu-separator"></div>
            <button class="menu-item" @click="zoomReset"><span class="menu-text">{{ t('_Return to Origin Page') }}</span></button>
            <button class="menu-item danger" @click="store.clearDocument()"><span class="menu-text">{{ t('Clear Document') }}</span></button>
          </div>
        </Popover>

        <Popover icon="app-menu" button-class="header-icon" align="right">
          <template #default="{ close }">
            <div class="menu-section-label">{{ t('File') }}</div>
            <button class="menu-item" @click="store.newTab(); close()"><RnoteIcon name="tab-new" class="sm" /><span class="menu-text">{{ t('_New') }}</span><span class="accel">Ctrl+T</span></button>
            <button class="menu-item" @click="store.openDocument(); close()"><RnoteIcon name="open" class="sm" /><span class="menu-text">{{ t('Open') }}</span><span class="accel">Ctrl+O</span></button>
            <button class="menu-item" @click="store.saveDocument(false); close()"><RnoteIcon name="save" class="sm" /><span class="menu-text">{{ t('Save') }}</span><span class="accel">Ctrl+S</span></button>
            <button class="menu-item" @click="store.saveDocument(true); close()"><RnoteIcon name="save" class="sm" /><span class="menu-text">{{ t('Save _As') }}</span></button>
            <div class="menu-separator"></div>
            <button class="menu-item" @click="store.printDoc(); close()"><RnoteIcon name="print" class="sm" /><span class="menu-text">{{ t('Print Document') }}</span><span class="accel">Ctrl+P</span></button>
            <button class="menu-item" @click="store.importFiles(); close()"><RnoteIcon name="import" class="sm" /><span class="menu-text">{{ t('Import File') }}</span></button>
            <button class="menu-item" @click="store.openDialog('export'); close()"><RnoteIcon name="export" class="sm" /><span class="menu-text">{{ t('_Export…') }}</span></button>
            <div class="menu-separator"></div>
            <div class="menu-section-label">{{ t('Edit') }}</div>
            <button class="menu-item" @click="undo(); close()"><RnoteIcon name="undo" class="sm" /><span class="menu-text">{{ t('Undo') }}</span><span class="accel">Ctrl+Z</span></button>
            <button class="menu-item" @click="redo(); close()"><RnoteIcon name="redo" class="sm" /><span class="menu-text">{{ t('Redo') }}</span><span class="accel">Ctrl+Shift+Z</span></button>
            <button class="menu-item" @click="store.engine?.selectAll(); close()"><span class="menu-text">{{ t('Select All Strokes') }}</span><span class="accel">Ctrl+A</span></button>
            <div class="menu-separator"></div>
            <button class="menu-item" @click="addPage(); close()"><RnoteIcon name="page-add" class="sm" /><span class="menu-text">{{ t('Add Page') }}</span></button>
            <button class="menu-item" @click="removePage(); close()"><RnoteIcon name="page-remove" class="sm" /><span class="menu-text">{{ t('Remove Page') }}</span></button>
            <button class="menu-item" @click="store.openSettings(); close()"><RnoteIcon name="settings" class="sm" /><span class="menu-text">{{ t('Settings') }}</span></button>
            <div class="menu-separator"></div>
            <button class="menu-item" @click="store.openDialog('shortcuts'); close()"><RnoteIcon name="keyboard" class="sm" /><span class="menu-text">{{ t('_Keyboard Shortcuts') }}</span></button>
            <button class="menu-item" @click="store.openDialog('about'); close()"><RnoteIcon name="info" class="sm" /><span class="menu-text">{{ t('A_bout Rnote') }}</span></button>
          </template>
        </Popover>
      </div>
    </header>
  </div>
</template>

<style scoped>
.header-wrap {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
}
.hdr-left,
.hdr-right {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1 1 0;
  min-width: 0;
}
.hdr-right {
  justify-content: flex-end;
}
.header-icon {
  width: 38px;
  height: 34px;
}
.hdr-center {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 180px;
}
.title-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.1;
}
.doc-title {
  font-weight: 800;
  font-size: 13px;
  color: var(--fg);
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-subtitle {
  font-size: 10.5px;
  color: var(--fg-muted);
}
.unsaved-bullet,
.dirty-inline {
  color: var(--fg-muted);
  font-size: 10px;
}
.canvas-menu,
.tab-overview-menu {
  min-width: 260px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.zoom-quickrow,
.page-quickrow {
  display: flex;
  gap: 4px;
}
.zoom-quickrow .btn,
.page-quickrow .btn {
  flex: 1;
  min-width: 42px;
}
.zoom-reset {
  flex: 1.4;
  font-size: 12px;
  font-weight: 700;
}
.menu-text {
  flex: 1;
  text-align: left;
}
.menu-item.active {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
}
.menu-item.danger .menu-text {
  color: var(--danger);
}
</style>
