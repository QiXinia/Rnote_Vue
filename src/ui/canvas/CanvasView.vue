<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useAppStore } from '../../stores/app'
import { CanvasController } from '../../composables/canvas-controller'
import { cssFamily } from '../../compose/style/fonts'
import { penAudio } from '../../engine/audio-player'
import CanvasCursor from './CanvasCursor.vue'

const store = useAppStore()
const zoomLabel = computed(() => {
  void store.uiTick
  return Math.round((store.engine?.camera.zoom ?? 1) * 100) + '%'
})
const canvasEl = ref<HTMLCanvasElement | null>(null)
// shallowRef so the template's v-if on controller.textEdit.active establishes a
// reactive dependency (a plain `let` controller never triggers overlay render)
const controller = shallowRef<CanvasController | null>(null)

const textEl = ref<HTMLDivElement | null>(null)

onMounted(() => {
  if (canvasEl.value) {
    controller.value = new CanvasController(canvasEl.value, store)
    controller.value.attach()
    store.canvasReady = true
  }
})

onBeforeUnmount(() => controller.value?.detach())

watch(
  () => store.activeId,
  () => nextTick(() => controller.value?.rebindEngine())
)

watch(
  () => store.theme,
  () => {
    controller.value?.ensureRenderer()
    controller.value?.requestFrame()
  }
)

function zoomIn() {
  store.engine?.camera.zoomIn()
  controller.value?.requestFrame()
  store.bump()
}
function zoomOut() {
  store.engine?.camera.zoomOut()
  controller.value?.requestFrame()
  store.bump()
}
function zoomReset() {
  store.engine?.camera.reset()
  controller.value?.requestFrame()
  store.bump()
}
function fitPage() {
  const e = store.engine
  if (!e) return
  e.camera.fitBounds(e.document.pageBounds(0))
  controller.value?.requestFrame()
  store.bump()
}

function onTextInput(e: Event) {
  controller.value?.syncEditorHtml((e.target as HTMLElement).innerHTML)
}
function onTextKeydown(e: KeyboardEvent) {
  if (store.engine?.settings.penSounds) {
    const modKeys = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph']
    if (!modKeys.includes(e.key)) {
      let kind: 'enter' | 'backspace' | 'delete' | 'tab' | 'char' | 'other'
      if (e.key === 'Enter') kind = 'enter'
      else if (e.key === 'Backspace') kind = 'backspace'
      else if (e.key === 'Delete') kind = 'delete'
      else if (e.key === 'Tab') kind = 'tab'
      else if (e.key.length === 1) kind = 'char'
      else kind = 'other'
      penAudio.typewriterKey(kind)
    }
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    controller.value?.commitTextEdit()
  } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    controller.value?.commitTextEdit()
  }
}
function onTextBlur() {
  controller.value?.commitTextEdit()
}
</script>

<template>
  <div class="canvas-wrapper">
    <canvas ref="canvasEl" class="draw" tabindex="0"></canvas>
    <CanvasCursor />

    <!-- typewriter contenteditable overlay -->
    <div
      v-if="controller?.textEdit.active"
      class="text-edit-wrap"
      :style="{
        left: controller.textEdit.screenX + 'px',
        top: controller.textEdit.screenY + 'px',
        width: controller.textEdit.width * controller.textEdit.zoom + 'px'
      }"
    >
      <div
        ref="textEl"
        class="text-editor"
        contenteditable="true"
        spellcheck="false"
        :style="{
          minHeight: controller.textEdit.fontSize * controller.textEdit.zoom * 1.4 + 'px',
          color: controller.textEdit.color,
          fontFamily: cssFamily(controller.textEdit.fontFamily),
          fontSize: controller.textEdit.fontSize * controller.textEdit.zoom + 'px',
          fontWeight: controller.textEdit.weight,
          fontStyle: controller.textEdit.italic ? 'italic' : 'normal',
          textDecoration:
            (controller.textEdit.underline ? 'underline ' : '') +
            (controller.textEdit.strike ? 'line-through' : ''),
          textAlign: controller.textEdit.align as any
        }"
        @input="onTextInput"
        @keydown="onTextKeydown"
        @blur="onTextBlur"
      ></div>
      <div
        class="text-width-handle"
        @pointerdown="controller.startTextWidthResize($event)"
        @pointermove="controller.moveTextWidthResize($event)"
        @pointerup="controller.endTextWidthResize()"
        @pointercancel="controller.endTextWidthResize()"
      ></div>
    </div>

  </div>
</template>
