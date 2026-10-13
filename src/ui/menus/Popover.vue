<script setup lang="ts">
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import RnoteIcon from '../icons/RnoteIcon.vue'
import { useAppStore } from '../../stores/app'

// The engine is markRaw (never made reactive), so changes to its nested
// config do not propagate through bindings. The app forces a refresh via
// store.uiTick. A Popover renders its default slot in its OWN render effect,
// which would not depend on uiTick — making the slot children stale. Subscribing
// the popover's render to uiTick keeps every in-popover control in sync.
const store = useAppStore()

const props = withDefaults(
  defineProps<{
    icon?: string
    label?: string
    title?: string
    align?: 'left' | 'right'
    buttonClass?: string
    image?: string
    panelWidth?: number
    menuId?: string
  }>(),
  { align: 'left', buttonClass: '', panelWidth: 312, menuId: '' }
)
const emit = defineEmits<{ (e: 'open'): void }>()

const open = ref(false)
const triggerEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
const popStyle = ref<Record<string, string>>({})

const CloseEventName = 'rnote:close-popovers'
const OpenEventName = 'rnote:open-popover'
function closeFromEvent(e: Event) {
  // A nested control (e.g. an RnSelect inside this popover) opening must not
  // close the popover that contains it.
  const src = (e as CustomEvent).detail as HTMLElement | undefined
  if (src && panelEl.value && panelEl.value.contains(src)) return
  open.value = false
}
function openFromEvent(e: Event) {
  // Keyboard accelerators (F9 canvas menu, F10 app menu, Ctrl+Shift+O overview)
  // open the matching header popover.
  const id = (e as CustomEvent).detail as string | undefined
  if (id && id === props.menuId && !open.value) void openPanel()
}
function onKeydown(e: KeyboardEvent) {
  // GTK popovers dismiss on Escape. A nested RnSelect that is open handles
  // Escape itself and stops propagation, so it closes before this popover.
  if (e.key === 'Escape' && open.value) open.value = false
}
onMounted(() => {
  window.addEventListener(CloseEventName, closeFromEvent)
  window.addEventListener(OpenEventName, openFromEvent)
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener(CloseEventName, closeFromEvent)
  window.removeEventListener(OpenEventName, openFromEvent)
  window.removeEventListener('keydown', onKeydown)
})

async function openPanel() {
  window.dispatchEvent(new CustomEvent(CloseEventName, { detail: triggerEl.value }))
  open.value = true
  emit('open')
  await nextTick()
  // Lay the panel out off-screen at its FINAL width first; otherwise its
  // unconstrained natural width is measured and the resulting left offset is
  // wrong (the popover ends up far from the rail it should point at).
  const pw = window.innerWidth <= 640 ? Math.min(props.panelWidth, window.innerWidth - 16) : props.panelWidth
  popStyle.value = { width: `${pw}px`, left: '-9999px', top: '0' }
  await nextTick()
  const r = triggerEl.value?.getBoundingClientRect()
  if (r) {
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

async function toggle() {
  if (open.value) open.value = false
  else await openPanel()
}

function closePopover() {
  open.value = false
}

defineExpose({ close: closePopover })
</script>

<template>
  <button ref="triggerEl" class="btn" :class="[buttonClass, { toggled: open }]" :data-tick="store.uiTick" @click.stop="toggle">
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
