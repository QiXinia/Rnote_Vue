<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { useAppStore } from './stores/app'
import AppWindow from './ui/appwindow/AppWindow.vue'
import DialogHost from './ui/dialogs/DialogHost.vue'
import ToastContainer from './ui/toast/ToastContainer.vue'
import ContextMenu from './ui/menus/ContextMenu.vue'

const store = useAppStore()

let cleanup: (() => void) | null = null

onMounted(async () => {
  const restored = store.restoreLastSession()
  if (!restored) {
    const restoredLarge = await store.restoreLastSessionAsync()
    if (!restoredLarge) store.createTab()
  }
  // periodic autosave + save on hide
  let autosaveIntervalSecs = 120
  try {
    autosaveIntervalSecs = JSON.parse(localStorage.getItem('rnote-web-general') || '{}').autosaveInterval ?? 120
  } catch { /* keep default */ }
  const timer = window.setInterval(() => store.autosave(), Math.max(5, autosaveIntervalSecs) * 1000)
  const onHide = () => store.autosave()
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('beforeunload', onHide)
  cleanup = () => {
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('beforeunload', onHide)
  }
})

onBeforeUnmount(() => cleanup?.())
</script>

<template>
  <AppWindow />
  <DialogHost />
  <ContextMenu />
  <ToastContainer />
</template>
