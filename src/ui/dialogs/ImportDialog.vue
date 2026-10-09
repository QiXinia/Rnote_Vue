<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../../stores/app'
import RnoteIcon from '../icons/RnoteIcon.vue'
import PreferencesGroup from '../widgets/PreferencesGroup.vue'
import SwitchRow from '../widgets/SwitchRow.vue'
import ComboRow from '../widgets/ComboRow.vue'
import ActionRow from '../widgets/ActionRow.vue'
import RnNumberInput from '../widgets/RnNumberInput.vue'

const store = useAppStore()
const { t } = useI18n()

// ---- PDF preferences (defaults match rnote-engine import.rs) ----
const pageStart = ref(1)
const pageEnd = ref(9999)
const adjustDocument = ref(false)
const widthPerc = ref(50)
const pageSpacing = ref<'continuous' | 'one-per-page'>('continuous')
const pagesType = ref<'vector' | 'bitmap'>('vector')
const bitmapScaleFactor = ref(1.8)

const spacingOptions = [
  { value: 'continuous', label: t('Continuous') },
  { value: 'one-per-page', label: t('One per Document Page') }
]

function confirmPdf() {
  store.confirmPdfImport({
    pageStart: pageStart.value,
    pageEnd: pageEnd.value,
    adjustDocument: adjustDocument.value,
    widthPerc: widthPerc.value,
    pageSpacing: pageSpacing.value,
    pagesType: pagesType.value,
    bitmapScaleFactor: bitmapScaleFactor.value
  })
}

// ---- XOPP preferences ----
const xoppDpi = ref(96)
function confirmXopp() {
  store.confirmXoppImport(xoppDpi.value)
}
</script>

<template>
  <div class="dialog-backdrop" @click.self="store.cancelImport()">
    <div class="dialog import-dialog">
      <div class="dialog-header">
        <h2>{{ store.pendingImport?.kind === 'xopp' ? t('Import Xournal++ File') : t('Import Pdf') }}</h2>
      </div>

      <div class="dialog-body">
        <!-- XOPP -->
        <template v-if="store.pendingImport?.kind === 'xopp'">
          <PreferencesGroup :title="t('Xournal++ File Import Preferences')">
            <ActionRow :title="t('DPI')" :subtitle="t('Set the preferred DPI for the Xournal++ file')">
              <template #suffix>
                <RnNumberInput v-model="xoppDpi" :min="1" :max="10000" :step="1" :width="140" />
              </template>
            </ActionRow>
          </PreferencesGroup>
        </template>

        <!-- PDF -->
        <template v-else>
          <PreferencesGroup :title="t('Pdf Import Preferences')">
            <ActionRow :title="t('Start Page')">
              <template #suffix>
                <RnNumberInput v-model="pageStart" :min="1" :step="1" :width="120" />
              </template>
            </ActionRow>
            <ActionRow :title="t('End Page')">
              <template #suffix>
                <RnNumberInput v-model="pageEnd" :min="1" :step="1" :width="120" />
              </template>
            </ActionRow>
            <SwitchRow
              v-model="adjustDocument"
              :title="t('Adjust Document')"
              :subtitle="t('Whether the document layout should be adjusted to the Pdf')"
            />
            <ActionRow :title="t('Page Width (%)')" :subtitle="t('Set the width of imported Pdf\'s in percentage to the format width')">
              <template #suffix>
                <RnNumberInput v-model="widthPerc" :min="1" :max="100" :step="1" :width="120" />
              </template>
            </ActionRow>
            <ComboRow
              v-model="pageSpacing"
              :title="t('Page Spacing')"
              :subtitle="t('How Pdf pages are spaced')"
              :options="spacingOptions"
              :width="190"
            />
            <ActionRow :title="t('Pages Type')" :subtitle="t('Set whether Pdf\'s should be imported as vector or bitmap images')">
              <template #suffix>
                <div class="linked-toggle">
                  <button
                    type="button"
                    :class="{ active: pagesType === 'vector' }"
                    @click="pagesType = 'vector'"
                  >{{ t('Vector') }}</button>
                  <button
                    type="button"
                    :class="{ active: pagesType === 'bitmap' }"
                    @click="pagesType = 'bitmap'"
                  >{{ t('Bitmap') }}</button>
                </div>
              </template>
            </ActionRow>
            <ActionRow
              v-if="pagesType === 'bitmap'"
              :title="t('Bitmap Scale-Factor')"
              :subtitle="t('Set the bitmap scale factor in relation\nto the actual size on the document')"
            >
              <template #suffix>
                <RnNumberInput v-model="bitmapScaleFactor" :min="0.1" :max="10" :step="0.1" :digits="1" :width="120" />
              </template>
            </ActionRow>
          </PreferencesGroup>
        </template>
      </div>

      <div class="dialog-footer">
        <button class="btn" @click="store.cancelImport()">{{ t('Cancel') }}</button>
        <button class="btn suggested" @click="store.pendingImport?.kind === 'xopp' ? confirmXopp() : confirmPdf()">
          <RnoteIcon name="import" class="sm" />{{ t('Import') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.import-dialog {
  width: 520px;
  max-width: calc(100vw - 32px);
}
.linked-toggle {
  display: inline-flex;
}
.linked-toggle button {
  padding: 7px 14px;
  border: 1px solid var(--border);
  background: var(--input-bg);
  color: var(--fg-muted);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
}
.linked-toggle button:first-child {
  border-radius: 8px 0 0 8px;
}
.linked-toggle button:last-child {
  border-radius: 0 8px 8px 0;
  border-left: none;
}
.linked-toggle button.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
</style>
