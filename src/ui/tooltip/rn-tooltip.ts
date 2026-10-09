// Rnote-style tooltip, porting GTK's GtkTooltip: a single shared dark rounded
// label that appears after a short hover delay (and on keyboard focus), is
// anchored to the control, and hides on leave / press. Exposed as the global
// `v-tip` directive; controls use v-tip="t('...')" instead of native title.
import type { Directive, DirectiveBinding } from 'vue'

let tipEl: HTMLDivElement | null = null
let showTimer: ReturnType<typeof setTimeout> | null = null
let currentEl: HTMLElement | null = null

function ensureEl(): HTMLDivElement {
  if (tipEl) return tipEl
  tipEl = document.createElement('div')
  tipEl.className = 'rn-tooltip'
  tipEl.setAttribute('role', 'tooltip')
  tipEl.style.visibility = 'hidden'
  document.body.appendChild(tipEl)
  return tipEl
}
function clearTimer() {
  if (showTimer) { clearTimeout(showTimer); showTimer = null }
}
function positionFor(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  const node = ensureEl()
  node.textContent = el.dataset.tip || ''
  const tw = node.offsetWidth
  const th = node.offsetHeight
  let left = r.left + r.width / 2 - tw / 2
  let top = r.top - th - 8
  if (top < 8) top = r.bottom + 8
  left = Math.max(6, Math.min(left, window.innerWidth - tw - 6))
  node.style.left = `${left}px`
  node.style.top = `${top}px`
}
function show(el: HTMLElement) {
  currentEl = el
  clearTimer()
  showTimer = setTimeout(() => {
    const node = ensureEl()
    positionFor(el)
    node.style.visibility = 'visible'
    node.classList.add('show')
  }, 500)
}
function hide() {
  clearTimer()
  if (tipEl) {
    tipEl.classList.remove('show')
    tipEl.style.visibility = 'hidden'
  }
  currentEl = null
}
function onEnter(this: HTMLElement) { show(this) }
function onLeave() { hide() }
function onFocus(this: HTMLElement) { show(this) }
function onBlur() { hide() }
function onDown() { hide() }

export const vTip: Directive<HTMLElement, string> = {
  mounted(el: HTMLElement, binding: DirectiveBinding<string>) {
    el.dataset.tip = binding.value
    // suppress the native tooltip so it does not double up with ours
    el.removeAttribute('title')
    el.addEventListener('pointerenter', onEnter)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('focus', onFocus)
    el.addEventListener('blur', onBlur)
    el.addEventListener('pointerdown', onDown, true)
  },
  updated(el: HTMLElement, binding: DirectiveBinding<string>) {
    el.dataset.tip = binding.value
  },
  unmounted(el: HTMLElement) {
    el.removeEventListener('pointerenter', onEnter)
    el.removeEventListener('pointerleave', onLeave)
    el.removeEventListener('focus', onFocus)
    el.removeEventListener('blur', onBlur)
    el.removeEventListener('pointerdown', onDown, true)
    if (currentEl === el) hide()
  }
}
