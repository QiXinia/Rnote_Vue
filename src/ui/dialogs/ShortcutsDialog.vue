<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../../stores/app'

const store = useAppStore()
const { t } = useI18n()
const groups = [
  {
    title: 'Navigation',
    rows: [
      ["Switch to the 'Brush'", 'Ctrl+1'],
      ["Switch to the 'Shaper'", 'Ctrl+2'],
      ["Switch to the 'Typewriter'", 'Ctrl+3'],
      ["Switch to the 'Eraser'", 'Ctrl+4'],
      ["Switch to the 'Selector'", 'Ctrl+5'],
      ["Switch to the 'Tools'", 'Ctrl+6']
    ]
  },
  {
    title: 'Drawing',
    rows: [
      ['Undo', 'Ctrl+Z'],
      ['Redo', 'Ctrl+Shift+Z'],
      ['Copy to Clipboard', 'Ctrl+C'],
      ['Cut to Clipboard', 'Ctrl+X'],
      ['Paste Clipboard', 'Ctrl+V'],
      ['Duplicate Selection', 'Ctrl+D'],
      ['Bold', 'Ctrl+B'],
      ['Italic', 'Ctrl+I'],
      ['Underline', 'Ctrl+U']
    ]
  },
  {
    title: 'Document',
    rows: [
      ['Open Document', 'Ctrl+O'],
      ['Save Document', 'Ctrl+S'],
      ['Save Document As', 'Ctrl+Shift+S'],
      ['Import File', 'Ctrl+Shift+I'],
      ['Print Document', 'Ctrl+P'],
      ['Clear Document', 'Ctrl+L'],
      ['Add Page (When in Fixed-Size Layout)', 'Ctrl+Shift+A'],
      ['Remove Last Page (When in Fixed-Size Layout)', 'Ctrl+Shift+R']
    ]
  },
  {
    title: 'View',
    rows: [
      ['Move View', 'Space / Middle-Mouse / Alt + Drag'],
      ['Zoom in', 'Ctrl+='],
      ['Zoom out', 'Ctrl+-'],
      ['Zoom in/out', 'Ctrl+Scroll'],
      ['Toggle Fullscreen', 'F11'],
      ['Show Keyboard Shortcuts', 'F1']
    ]
  }
]
</script>

<template>
  <div class="dialog-backdrop" @click.self="store.closeDialog()">
    <div class="dialog large">
      <div class="dialog-header"><h2>{{ t('_Keyboard Shortcuts') }}</h2></div>
      <div class="dialog-body">
        <div v-for="g in groups" :key="g.title" class="shortcut-group">
          <h3>{{ t(g.title) }}</h3>
          <div v-for="row in g.rows" :key="row[0]" class="shortcut-row">
            <span>{{ t(row[0]) }}</span>
            <span><kbd v-for="(k, i) in row[1].split(' / ')" :key="i" style="margin-left: 4px">{{ k }}</kbd></span>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="btn suggested" @click="store.closeDialog()">{{ t('Close') }}</button>
      </div>
    </div>
  </div>
</template>
