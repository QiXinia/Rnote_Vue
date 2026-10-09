<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../../stores/app'

const store = useAppStore()
const { t } = useI18n()
</script>

<template>
  <div class="dialog-backdrop" @click.self="store.cancelCloseTab()">
    <div class="dialog" style="width: min(460px, 94vw)">
      <div class="dialog-header">
        <h2>{{ t('Close Tab') }}</h2>
      </div>
      <div class="dialog-body">
        <p class="muted" style="margin: 4px 0; line-height: 1.6; white-space: pre-line">
          {{ t('This tab contains unsaved changes.\nChanges which are not saved will be permanently lost.') }}
        </p>
      </div>
      <div class="dialog-footer">
        <button class="btn" @click="store.cancelCloseTab()">{{ t('Cancel') }}</button>
        <button class="btn danger raised" @click="store.discardAndCloseTab()">{{ t('Discard') }}</button>
        <button class="btn suggested raised" @click="store.saveAndCloseTab()">{{ t('Save') }}</button>
      </div>
    </div>
  </div>
</template>
