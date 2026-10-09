<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../../stores/app'
import { loadRecent, saveRecent, type RecentDoc } from '../../engine/fileformats/autosave'
import RnoteIcon from '../icons/RnoteIcon.vue'

const store = useAppStore()
const { t } = useI18n()
const refreshKey = ref(0)
const recent = computed<RecentDoc[]>(() => {
  void refreshKey.value
  void store.uiTick
  return loadRecent()
})

const strokeCount = computed(() => {
  void store.uiTick
  return store.engine?.store.strokes.size ?? 0
})

function openRecent(doc: RecentDoc) {
  store.createTab(doc.snapshot, doc.name)
  store.pushToast(`${t('Opened')} ${doc.name}`)
}
function saveToRecent() {
  if (!store.activeTab || !store.engine) return
  const list = loadRecent().filter((d) => d.name !== store.activeTab!.name)
  list.unshift({ name: store.activeTab.name, savedAt: Date.now(), snapshot: store.engine.snapshot() })
  saveRecent(list)
  refreshKey.value++
  store.pushToast(t('Pinned to Workspace'))
}
</script>

<template>
  <aside class="workspace-browser">
    <header>{{ t('Workspace') }}</header>
    <div style="padding: 0 10px 10px; display: flex; flex-direction: column; gap: 6px">
      <button class="btn raised" style="justify-content: flex-start" @click="store.newTab()"><RnoteIcon name="doc-new" class="sm" />{{ t('New Document') }}</button>
      <button class="btn raised" style="justify-content: flex-start" @click="store.openDocument()"><RnoteIcon name="open" class="sm" />{{ t('Open') }} .rnote…</button>
      <button class="btn raised" style="justify-content: flex-start" @click="store.importFiles()"><RnoteIcon name="import" class="sm" />{{ t('Import') }}…</button>
      <button class="btn raised" style="justify-content: flex-start" @click="store.saveDocument(false)"><RnoteIcon name="save" class="sm" />{{ t('Save') }}</button>
      <button class="btn raised" style="justify-content: flex-start" @click="store.openDialog('export')"><RnoteIcon name="export" class="sm" />{{ t('Export') }}…</button>
      <button class="btn" style="justify-content: flex-start" @click="saveToRecent()"><RnoteIcon name="pin" class="sm" />{{ t('Pin to Workspace') }}</button>
    </div>

    <header>{{ t('Current Document') }}</header>
    <div style="padding: 0 12px 10px; font-size: 12px" class="muted col">
      <div class="row between"><span>{{ t('Strokes') }}</span><span>{{ strokeCount }}</span></div>
      <div class="row between"><span>{{ t('Pages') }}</span><span>{{ store.engine?.document.pages ?? 1 }}</span></div>
      <div class="row between"><span>{{ t('Zoom') }}</span><span>{{ Math.round((store.engine?.camera.zoom ?? 1) * 100) }}%</span></div>
    </div>

    <header>{{ t('Recent Documents') }}</header>
    <div style="overflow-y: auto; min-height: 0">
      <div v-if="!recent.length" class="muted" style="padding: 8px 12px; font-size: 12px">
        {{ t('No pinned documents yet. Pin a document to restore it quickly.') }}
      </div>
      <div v-for="(doc, i) in recent" :key="i" class="file-row" @click="openRecent(doc)">
        <RnoteIcon name="file" class="sm" />
        <div style="min-width: 0">
          <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ doc.name }}</div>
          <div class="faint" style="font-size: 11px">{{ new Date(doc.savedAt).toLocaleString() }}</div>
        </div>
      </div>
    </div>
  </aside>
</template>
