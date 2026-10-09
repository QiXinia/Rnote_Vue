<script setup lang="ts">
import { useAppStore } from '../../stores/app'
import MainHeader from '../mainheader/MainHeader.vue'
import TabBar from '../tabbar/TabBar.vue'
import PenSidebar from '../penssidebar/PenSidebar.vue'
import PenSwitcher from '../penssidebar/PenSwitcher.vue'
import ColorToolbar from '../colorpicker/ColorToolbar.vue'
import CanvasView from '../canvas/CanvasView.vue'
import SideBar from '../sidebar/SideBar.vue'

const store = useAppStore()
</script>

<template>
  <div class="app-window">
    <MainHeader />
    <TabBar />
    <div class="app-body" :class="{ 'focus-mode': store.focusMode }">
      <CanvasView />
      <template v-if="!store.focusMode">
        <ColorToolbar class="floating-color" />
        <SideBar v-if="store.workspaceOpen" class="floating-workspace" />
        <PenSidebar v-if="store.sidebarOpen" class="floating-tools" />
        <PenSwitcher class="floating-switcher" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.app-body {
  position: relative;
  overflow: hidden;
}
.floating-color {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 24;
}
.floating-tools {
  position: absolute;
  top: 72px;
  bottom: 72px;
  right: 18px;
  z-index: 25;
  pointer-events: auto;
}
.floating-switcher {
  position: absolute;
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  z-index: 26;
}
.floating-workspace {
  position: absolute;
  inset: 0 auto 0 0;
  z-index: 40;
}
.focus-mode .floating-color,
.focus-mode .floating-tools,
.focus-mode .floating-switcher,
.focus-mode .floating-workspace {
  display: none;
}
@media (max-width: 640px) {
  .floating-color {
    top: 8px;
  }
  .floating-tools {
    top: 62px;
    bottom: 76px;
    right: 8px;
  }
  .floating-switcher {
    bottom: 10px;
  }
}
</style>
