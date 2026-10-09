<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../../stores/app'
import { FormatPredefined, Orientation, FORMAT_PREDEFINED_LABELS } from '../../engine/document/format'
import { Layout } from '../../engine/document/layout'
import { PatternStyle, PATTERN_LABELS } from '../../engine/document/background'
import RnoteIcon from '../icons/RnoteIcon.vue'
import ColorField from '../colorpicker/ColorField.vue'
import PreferencesGroup from '../widgets/PreferencesGroup.vue'
import ComboRow from '../widgets/ComboRow.vue'
import ActionRow from '../widgets/ActionRow.vue'
import SwitchRow from '../widgets/SwitchRow.vue'
import RnNumberInput from '../widgets/RnNumberInput.vue'
import RnUnitEntry from '../widgets/RnUnitEntry.vue'

const store = useAppStore()
const { t } = useI18n()
const e = computed(() => store.engine!)

const layouts = [
  { v: Layout.FixedSize, label: 'Fixed Size' },
  { v: Layout.ContinuousVertical, label: 'Continuous Vertical' },
  { v: Layout.SemiInfinite, label: 'Semi Infinite' },
  { v: Layout.Infinite, label: 'Infinite' }
]
const presetOptions = [
  FormatPredefined.A3,
  FormatPredefined.A4,
  FormatPredefined.A5,
  FormatPredefined.A6,
  FormatPredefined.Letter,
  FormatPredefined.Legal,
  FormatPredefined.Custom
].map((p) => ({ value: p, label: t(FORMAT_PREDEFINED_LABELS[p]) }))

const patternIcons: Record<PatternStyle, string> = {
  [PatternStyle.None]: 'close',
  [PatternStyle.Lines]: 'lines',
  [PatternStyle.Grid]: 'grid',
  [PatternStyle.Dots]: 'dots',
  [PatternStyle.IsometricGrid]: 'iso-grid',
  [PatternStyle.IsometricDots]: 'iso-dots'
}
const patterns = [
  PatternStyle.None,
  PatternStyle.Lines,
  PatternStyle.Grid,
  PatternStyle.Dots,
  PatternStyle.IsometricGrid,
  PatternStyle.IsometricDots
]

function changed() {
  e.value.notify()
}

const presetVal = computed({
  get: () => e.value.document.format.predefined,
  set: (v) => {
    e.value.document.format.applyPredefined(v as FormatPredefined)
    changed()
  }
})
const layoutVal = computed({
  get: () => e.value.document.layout,
  set: (v) => {
    e.value.document.layout = v as Layout
    changed()
  }
})
const widthPx = computed({
  get: () => e.value.document.format.width,
  set: (v) => {
    e.value.document.format.setWidth(v)
    changed()
  }
})
const heightPx = computed({
  get: () => e.value.document.format.height,
  set: (v) => {
    e.value.document.format.setHeight(v)
    changed()
  }
})
const dpiVal = computed({
  get: () => e.value.document.format.dpi,
  set: (v) => {
    e.value.document.format.setDpi(v)
    changed()
  }
})
const showBorder = computed({
  get: () => e.value.document.format.showBorder,
  set: (v) => {
    e.value.document.format.showBorder = v
    changed()
  }
})
const patW = computed({
  get: () => e.value.document.background.patternSize.x,
  set: (v) => {
    e.value.document.background.patternSize.x = v
    changed()
  }
})
const patH = computed({
  get: () => e.value.document.background.patternSize.y,
  set: (v) => {
    e.value.document.background.patternSize.y = v
    changed()
  }
})
const bgColor = computed({
  get: () => e.value.document.background.color,
  set: (v) => {
    e.value.document.background.color = v
    changed()
  }
})
const patColor = computed({
  get: () => e.value.document.background.patternColor,
  set: (v) => {
    e.value.document.background.patternColor = v
    changed()
  }
})
</script>

<template>
  <div class="dialog-backdrop" @click.self="store.closeDialog()">
    <div class="dialog large">
      <div class="dialog-header"><h2>{{ t('Document Settings') }}</h2></div>
      <div class="dialog-body">
        <PreferencesGroup :title="t('Document Layout')">
          <ActionRow :title="t('Layout')">
            <template #suffix>
              <div class="seg">
                <button
                  v-for="l in layouts"
                  :key="l.v"
                  type="button"
                  class="seg-btn"
                  :class="{ active: layoutVal === l.v }"
                  @click="layoutVal = l.v"
                >{{ t(l.label) }}</button>
              </div>
            </template>
          </ActionRow>
          <ComboRow v-model="presetVal" :title="t('Page Format')" :options="presetOptions" :width="170" />
          <ActionRow :title="t('Orientation')">
            <template #suffix>
              <div class="seg">
                <button type="button" class="seg-btn" :class="{ active: e.document.format.orientation === Orientation.Portrait }" @click="(e.document.format.setOrientation(Orientation.Portrait), changed())">{{ t('Portrait') }}</button>
                <button type="button" class="seg-btn" :class="{ active: e.document.format.orientation === Orientation.Landscape }" @click="(e.document.format.setOrientation(Orientation.Landscape), changed())">{{ t('Landscape') }}</button>
              </div>
            </template>
          </ActionRow>
          <ActionRow :title="t('Width')">
            <template #suffix><RnUnitEntry v-model="widthPx" :dpi="e.document.format.dpi" :min="10" :max="10000" :step="1" :width="110" /></template>
          </ActionRow>
          <ActionRow :title="t('Height')">
            <template #suffix><RnUnitEntry v-model="heightPx" :dpi="e.document.format.dpi" :min="10" :max="10000" :step="1" :width="110" /></template>
          </ActionRow>
          <ActionRow :title="t('Dpi')">
            <template #suffix><RnNumberInput v-model="dpiVal" :min="36" :max="600" :step="1" :width="150" /></template>
          </ActionRow>
          <SwitchRow v-model="showBorder" :title="t('Show Format Borders')" />
        </PreferencesGroup>

        <PreferencesGroup :title="t('Pages')">
          <ActionRow :title="t('Add / Remove Page')" :subtitle="`${t('Page')}: ${e.document.pages}`">
            <template #suffix>
              <button class="btn sm raised" @click="(e.document.addPage(), changed())"><RnoteIcon name="page-add" class="sm" />{{ t('Add Page') }}</button>
              <button class="btn sm raised" style="margin-left:6px" @click="(e.document.removePage(), changed())"><RnoteIcon name="page-remove" class="sm" />{{ t('Remove Page') }}</button>
            </template>
          </ActionRow>
        </PreferencesGroup>

        <PreferencesGroup :title="t('Background')">
          <ActionRow :title="t('Color')">
            <template #suffix><ColorField v-model="bgColor" /></template>
          </ActionRow>
          <ActionRow :title="t('Pattern Color')">
            <template #suffix><ColorField v-model="patColor" /></template>
          </ActionRow>
          <ActionRow :title="t('Pattern')">
            <template #suffix>
              <div class="icon-grid compact">
                <button v-for="p in patterns" :key="p" type="button" class="ig-btn" :class="{ active: e.document.background.pattern === p }" :title="t(PATTERN_LABELS[p])"
                  @click="(e.document.background.pattern = p), changed()">
                  <RnoteIcon :name="patternIcons[p]" />
                </button>
              </div>
            </template>
          </ActionRow>
          <ActionRow :title="t('Pattern Width')">
            <template #suffix><RnUnitEntry v-model="patW" :dpi="e.document.format.dpi" :min="4" :max="200" :step="1" :width="100" /></template>
          </ActionRow>
          <ActionRow :title="t('Pattern Height')">
            <template #suffix><RnUnitEntry v-model="patH" :dpi="e.document.format.dpi" :min="4" :max="200" :step="1" :width="100" /></template>
          </ActionRow>
        </PreferencesGroup>
      </div>
      <div class="dialog-footer">
        <button class="btn suggested" @click="store.closeDialog()">{{ t('Close') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.seg {
  display: inline-flex;
}
.seg-btn {
  padding: 7px 11px;
  border: 1px solid var(--border);
  background: var(--input-bg);
  color: var(--fg-muted);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.seg-btn:not(:last-child) {
  border-right: none;
}
.seg-btn:first-child {
  border-radius: 8px 0 0 8px;
}
.seg-btn:last-child {
  border-radius: 0 8px 8px 0;
}
.seg-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.icon-grid.compact {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}
.ig-btn {
  width: 38px;
  height: 38px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--fg-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.ig-btn:hover {
  background: var(--hover-bg);
}
.ig-btn.active {
  background: var(--accent-bg);
  border-color: var(--accent);
  color: var(--accent);
}
</style>
