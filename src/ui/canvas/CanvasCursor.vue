<script setup lang="ts">// Self-drawn canvas cursor, rendering the exact upstream cursor textures
// (cursor-dot / crosshair / teardrop / beam / invisible) so the General panel's
// Regular / Drawing cursor preferences, including teardrop and beam, take effect.
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useAppStore } from '../../stores/app'
import { PenStyle } from '../../engine/pens/pensconfig'
import { CURSOR_TEX } from './cursorTextures'

const store = useAppStore()
const layer = ref<HTMLDivElement | null>(null)
const px = ref(-100)
const py = ref(-100)
const visible = ref(false)
let canvas: HTMLCanvasElement | null = null
let parent: HTMLElement | null = null

const drawingTools = new Set<PenStyle>([PenStyle.Brush, PenStyle.Shaper])
const cursorType = computed<string>(() => {
  const pen = store.engine?.currentPen
  if (pen && drawingTools.has(pen)) {
    return store.general.showDrawingCursor ? store.general.drawingCursor : 'cursor-invisible'
  }
  return store.general.regularCursor
})

const isSystemArrow = computed(() => cursorType.value === 'cursor-arrow')
const tex = computed(() => CURSOR_TEX[cursorType.value] ?? null)
const showShape = computed(() => visible.value && !isSystemArrow.value && tex.value !== null)

function onMove(e: PointerEvent) {
  if (!parent) return
  const r = parent.getBoundingClientRect()
  px.value = e.clientX - r.left
  py.value = e.clientY - r.top
  visible.value = true
}
function onLeave() {
  visible.value = false
}

watch(cursorType, (t) => {
  if (!canvas) return
  canvas.style.cursor = t === 'cursor-arrow' ? 'default' : 'none'
})

onMounted(() => {
  parent = layer.value?.parentElement ?? null
  canvas = parent?.querySelector('canvas') ?? null
  if (canvas) canvas.style.cursor = cursorType.value === 'cursor-arrow' ? 'default' : 'none'
  parent?.addEventListener('pointermove', onMove)
  parent?.addEventListener('pointerleave', onLeave)
})
onBeforeUnmount(() => {
  parent?.removeEventListener('pointermove', onMove)
  parent?.removeEventListener('pointerleave', onLeave)
  if (canvas) canvas.style.cursor = ''
})
</script>

<template>
  <div ref="layer" class="cursor-layer">
    <div v-show="showShape" class="cursor-anchor" :style="{ left: px + 'px', top: py + 'px' }">
      <svg
        :viewBox="tex ? tex.viewBox : '0 0 64 64'"
        width="64"
        height="64"
        shape-rendering="geometricPrecision"
        v-html="tex ? tex.inner : ''"
      ></svg>
    </div>
  </div>
</template>

<style scoped>
.cursor-layer {
  position: absolute;
  inset: 0;
  z-index: 6;
  pointer-events: none;
  overflow: hidden;
}
.cursor-anchor {
  position: absolute;
  transform: translate(-50%, -50%);
  line-height: 0;
}
.cursor-anchor svg {
  display: block;
}
</style>
