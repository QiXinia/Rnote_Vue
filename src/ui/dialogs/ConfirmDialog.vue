<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../../stores/app'
import RnoteIcon from '../icons/RnoteIcon.vue'

const props = defineProps<{ kind: string }>()
const store = useAppStore()
const { t } = useI18n()

const isClear = computed(() => props.kind === 'confirm-clear')

function confirm() {
  if (isClear.value) {
    store.clearDocument()
  } else {
    store.createTab()
    store.closeDialog()
  }
}
</script>

<template>
  <div class="dialog-backdrop" @click.self="store.closeDialog()">
    <div class="dialog" style="width: min(440px, 94vw)">
      <div class="dialog-header">
        <h2 style="display: flex; align-items: center; gap: 10px">
          <RnoteIcon name="warning" style="color: var(--warning)" />
          {{ isClear ? t('Clear Document') : t('New Document') }}
        </h2>
      </div>
      <div class="dialog-body">
        <p class="muted" style="margin: 4px 0; line-height: 1.6; white-space: pre-line">
          {{
            isClear
              ? t('This clears the entire document. Please confirm.')
              : t('Creating a new document will discard any unsaved changes.\nDo you want to save the current document?')
          }}
        </p>
      </div>
      <div class="dialog-footer">
        <button class="btn" @click="store.closeDialog()">{{ t('Cancel') }}</button>
        <button class="btn danger raised" @click="confirm">{{ isClear ? t('Clear') : t('Discard') }}</button>
      </div>
    </div>
  </div>
</template>
