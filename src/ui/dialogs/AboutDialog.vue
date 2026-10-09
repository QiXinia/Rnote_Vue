<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../../stores/app'
import RnoteIcon from '../icons/RnoteIcon.vue'

const store = useAppStore()
const { t } = useI18n()
</script>

<template>
  <div class="dialog-backdrop" @click.self="store.closeDialog()">
    <div class="dialog">
      <div class="dialog-body" style="text-align: center; padding: 28px 24px">
        <div style="color: var(--accent); display: flex; justify-content: center; margin-bottom: 10px">
          <RnoteIcon name="rnote" style="width: 72px; height: 72px" />
        </div>
        <h2 style="margin: 4px 0">Rnote</h2>
        <p class="muted" style="margin: 4px 0">{{ t('Sketch and take handwritten notes') }}</p>
        <p class="muted" style="font-size: 12px; line-height: 1.6; margin: 14px 0">
          {{ t('Version 0.15.0-vue · a Vue 3 rebuild of Rnote 0.15') }}
        </p>
        <p class="faint" style="font-size: 11.5px">
          {{ t('Canvas 2D rendering · gzip JSON (.rnote) container · autosave to localStorage') }}
        </p>
      </div>
      <div class="dialog-footer">
        <button class="btn suggested" @click="store.closeDialog()">{{ t('Close') }}</button>
      </div>
    </div>
  </div>
</template>
