<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../../stores/app'
import WorkspaceBrowser from '../workspacebrowser/WorkspaceBrowser.vue'
import SettingsPanel from '../settingspanel/SettingsPanel.vue'
import RnoteIcon from '../icons/RnoteIcon.vue'

const store = useAppStore()
const { t } = useI18n()
</script>

<template>
  <aside class="sidebar-shell">
    <header class="sidebar-header">
      <button class="btn flat icon-btn" :title="t('Show/Hide Sidebar')" @click="store.toggleWorkspace()">
        <RnoteIcon name="dir-right" />
      </button>
      <div class="view-switcher" role="tablist" :aria-label="t('Show/Hide Sidebar')">
        <button :class="{ active: store.sidebarTab === 'workspace' }" role="tab" @click="store.sidebarTab = 'workspace'">
          <RnoteIcon name="workspacebrowser" /> {{ t('Workspace') }}
        </button>
        <button :class="{ active: store.sidebarTab === 'settings' }" role="tab" @click="store.sidebarTab = 'settings'">
          <RnoteIcon name="settings" /> {{ t('Settings') }}
        </button>
      </div>
      <div class="header-end" />
    </header>
    <div class="sidebar-content">
      <WorkspaceBrowser v-if="store.sidebarTab === 'workspace'" class="sidebar-page" />
      <SettingsPanel v-else class="sidebar-page" />
    </div>
  </aside>
</template>

<style scoped>
.sidebar-shell {
  width: min(550px, 30vw);
  min-width: 500px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border);
}
.sidebar-header {
  height: 50px;
  display: grid;
  grid-template-columns: 48px 1fr 48px;
  align-items: center;
  border-bottom: 1px solid var(--border);
}
.view-switcher {
  justify-self: center;
  display: inline-flex;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 9px;
}
.view-switcher button {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  border: 0;
  background: var(--button-bg);
  color: var(--fg);
  font-size: 13px;
}
.view-switcher button:first-child { border-right: 1px solid var(--border); }
.view-switcher button.active { background: var(--button-flat-active); }
.header-end { width: 48px; }
.sidebar-content { min-height: 0; flex: 1; }
.sidebar-page { width: 100%; height: 100%; }
@media (max-width: 1250px) {
  .sidebar-shell { width: min(550px, 82vw); }
}
</style>
