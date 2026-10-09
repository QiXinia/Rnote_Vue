<script setup lang="ts">
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import RnoteIcon from '../icons/RnoteIcon.vue'

const props = withDefaults(
  defineProps<{
    icon?: string
    label?: string
    title?: string
    align?: 'left' | 'right'
    buttonClass?: string
    image?: string
    panelWidth?: number
  }>(),
  { align: 'left', buttonClass: '', panelWidth: 312 }
)
const emit = defineEmits<{ (e: 'open'): void }>()

const open = ref(false)
const triggerEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
const popStyle = ref<Record<string, string>>({})

const CloseEventName = 'rnote:close-popovers'
function closeFromEvent(e: Event) {
  // A nested control (e.g. an RnSelect inside this popover) opening must not
  // close the popover that contains it.
  const src = (e as CustomEvent).detail as HTMLElement | undefined
  if (src && panelEl.value && panelEl.value.contains(src)) return
  open.value = false
}
onMounted(() => window.addEventListener(CloseEventName, closeFromEvent))
onBeforeUnmount(() => window.removeEventListener(CloseEventName, closeFromEvent))

async function toggle() {
  if (!open.value) window.dispatchEvent(new CustomEvent(CloseEventName, { detail: triggerEl.value }))
  open.value = !open.value
  if (open.value) {
    emit('open')
    await nextTick()
    // Lay the panel out off-screen at its FINAL width first; otherwise its
    // unconstrained natural width is measured and the resulting left offset is
    // wrong (the popover ends up far from the rail it should point at).
    popStyle.value = { width: `${props.panelWidth}px`, left: '-9999px', top: '0' }
    await nextTick()
    const r = triggerEl.value?.getBoundingClientRect()
    if (r) {
      const pw = props.panelWidth
      const ph = panelEl.value?.offsetHeight ?? 300
      let left: number
      let top: number
      if (props.align === 'right') {
        // Desktop pen sidebar popovers point to the left.
        left = r.left - pw - 6
        top = r.top + r.height / 2 - ph / 2
      } else {
        left = r.right + 6
        top = r.top + r.height / 2 - ph / 2
      }
      left = Math.max(8, Math.min(left, window.innerWidth - pw - 8))
      top = Math.max(8, Math.min(top, window.innerHeight - ph - 8))
      popStyle.value = { left: `${left}px`, top: `${top}px`, width: `${pw}px` }
    }
  }
}

function closePopover() {
  open.value = false
}

defineExpose({ close: closePopover })
</script>

<template>
  <button ref="triggerEl" class="btn" :class="[buttonClass, { toggled: open }]" @click.stop="toggle">
      <RnoteIcon v-if="icon" :name="open && image ? image : icon" />
      <span v-if="label" class="label">{{ label }}</span>
      <span v-if="$slots.trigger"><slot name="trigger" :open="open" /></span>
    </button>
    <Teleport to="body">
      <template v-if="open">
        <div class="popover-backdrop" @click.stop="open = false" @contextmenu.prevent="open = false"></div>
        <div ref="panelEl" class="popover" :style="popStyle" @click.stop>
          <div v-if="title" class="menu-section-label">{{ title }}</div>
          <slot :close="closePopover" />
        </div>
      </template>
    </Teleport>
</template>
