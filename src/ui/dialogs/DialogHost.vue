<script setup lang="ts">
import { useAppStore } from '../../stores/app'
import ExportDialog from './ExportDialog.vue'
import ImportDialog from './ImportDialog.vue'
import DocumentSettingsDialog from './DocumentSettingsDialog.vue'
import AboutDialog from './AboutDialog.vue'
import ShortcutsDialog from './ShortcutsDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import CloseTabDialog from './CloseTabDialog.vue'

const store = useAppStore()
</script>

<template>
  <ExportDialog v-if="store.dialog === 'export'" />
  <ImportDialog v-else-if="store.dialog === 'import'" />
  <DocumentSettingsDialog v-else-if="store.dialog === 'document-settings'" />
  <AboutDialog v-else-if="store.dialog === 'about'" />
  <ShortcutsDialog v-else-if="store.dialog === 'shortcuts'" />
  <ConfirmDialog
    v-else-if="store.dialog === 'confirm-clear' || store.dialog === 'confirm-new'"
    :kind="store.dialog"
  />
  <CloseTabDialog v-if="store.closingTabId !== null" />
</template>
