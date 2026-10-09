<script setup lang="ts">
import { ref, computed } from 'vue'
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
type Region = 'selection' | 'page' | 'all-pages' | 'entire-document'
type Fmt = 'png' | 'jpeg' | 'svg' | 'pdf' | 'xopp'

const region = ref<Region>('entire-document')
const format = ref<Fmt>('png')
const withBackground = ref(true)
const withPattern = ref(true)
const optimizePrinting = ref(false)
const pageOrder = ref<'horizontal-first' | 'vertical-first'>('horizontal-first')
const dpi = ref(144)
const margin = ref(16)

const regionOptions = [
  { value: 'selection', label: t('Selection') },
  { value: 'page', label: t('Current Page') },
  { value: 'all-pages', label: t('All Pages') },
  { value: 'entire-document', label: t('Entire Document') }
]
const formats: { v: Fmt; label: string }[] = [
  { v: 'png', label: 'PNG' },
  { v: 'jpeg', label: 'JPEG' },
  { v: 'svg', label: 'SVG' },
  { v: 'pdf', label: 'PDF' },
  { v: 'xopp', label: 'XOPP' }
]
const pageOrderOptions = [
  { value: 'horizontal-first', label: t('Horizontal First') },
  { value: 'vertical-first', label: t('Vertical First') }
]

const isXopp = computed(() => format.value === 'xopp')
const showDpi = computed(() => format.value === 'png' || format.value === 'jpeg' || format.value === 'pdf')
const showBgPrefs = computed(() => !isXopp.value)
const showMargin = computed(() => region.value === 'selection' && format.value !== 'xopp')

function prefs() {
  return {
    withBackground: withBackground.value,
    withPattern: withPattern.value,
    optimizePrinting: optimizePrinting.value,
    pageOrder: pageOrder.value
  }
}

function doExport() {
  if (format.value === 'svg') {
    store.exportSvg({ region: region.value, margin: margin.value, ...prefs() })
  } else if (format.value === 'xopp') {
    store.exportXoppDoc()
  } else if (format.value === 'pdf') {
    store.exportPdf({ region: region.value, dpi: dpi.value, margin: margin.value, ...prefs() })
  } else {
    store.exportImage({
      region: region.value,
      format: format.value as 'png' | 'jpeg',
      dpi: dpi.value,
      margin: margin.value,
      ...prefs()
    })
  }
  store.closeDialog()
}
</script>

<template>
  <div class="dialog-backdrop" @click.self="store.closeDialog()">
    <div class="dialog export-dialog">
      <div class="dialog-header"><h2>{{ t('Export Document') }}</h2></div>

      <div class="dialog-body">
        <PreferencesGroup>
          <ComboRow
            v-model="region"
            :title="t('Export Region')"
            :options="regionOptions"
            :width="190"
          />
          <ActionRow :title="t('Export Format')" :subtitle="t('The export image format')">
            <template #suffix>
              <div class="format-group">
                <button
                  v-for="f in formats"
                  :key="f.v"
                  type="button"
                  class="fmt-btn"
                  :class="{ active: format === f.v }"
                  @click="format = f.v"
                >{{ f.label }}</button>
              </div>
            </template>
          </ActionRow>
        </PreferencesGroup>

        <PreferencesGroup v-if="showBgPrefs" :title="t('Export Preferences')">
          <SwitchRow
            v-model="withBackground"
            :title="t('With Background')"
            :subtitle="t('Set whether the background should be exported')"
          />
          <SwitchRow
            v-model="withPattern"
            :title="t('With Pattern')"
            :subtitle="t('Set whether the background pattern should be exported')"
          />
          <SwitchRow
            v-model="optimizePrinting"
            :title="t('Optimize for Printing')"
            :subtitle="t('Set whether the content should be optimized for printing')"
          />
          <ComboRow
            v-model="pageOrder"
            :title="t('Page Order')"
            :subtitle="t('The page order when documents with layouts\nthat expand in horizontal and vertical directions\nare cut into pages')"
            :options="pageOrderOptions"
            :width="180"
          />
        </PreferencesGroup>

        <PreferencesGroup v-if="showDpi">
          <ActionRow :title="t('Resolution (DPI)')">
            <template #suffix>
              <RnNumberInput v-model="dpi" :min="72" :max="600" :step="1" :width="140" />
            </template>
          </ActionRow>
        </PreferencesGroup>

        <PreferencesGroup v-if="showMargin">
          <ActionRow :title="t('Margin')">
            <template #suffix>
              <RnNumberInput v-model="margin" :min="0" :max="1000" :step="1" :width="140" suffix="px" />
            </template>
          </ActionRow>
        </PreferencesGroup>
      </div>

      <div class="dialog-footer">
        <button class="btn" @click="store.closeDialog()">{{ t('Cancel') }}</button>
        <button class="btn suggested" @click="doExport">
          <RnoteIcon name="export" class="sm" />{{ t('Export') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.export-dialog {
  width: 560px;
  max-width: calc(100vw - 32px);
}
.format-group {
  display: inline-flex;
}
.fmt-btn {
  padding: 7px 11px;
  border: 1px solid var(--border);
  background: var(--input-bg);
  color: var(--fg-muted);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.fmt-btn:not(:last-child) {
  border-right: none;
}
.fmt-btn:first-child {
  border-radius: 8px 0 0 8px;
}
.fmt-btn:last-child {
  border-radius: 0 8px 8px 0;
}
.fmt-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
</style>
