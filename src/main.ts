import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { i18n } from './i18n'
import { vTip } from './ui/tooltip/rn-tooltip'
import './styles/adwaita.css'
// Official upstream Rnote application icon. Imported as an asset so Vite emits
// a base-aware, content-hashed file on the web build and inlines a data: URI in
// the single-file CDN build (which has no public/ dir).
import rnoteIconUrl from './assets/rnote-logo.svg'

// Set the favicon from the bundled asset (works with sub-path base and the
// inlined single-file CDN build).
const favicon = document.createElement('link')
favicon.rel = 'icon'
favicon.type = 'image/svg+xml'
favicon.href = rnoteIconUrl
document.head.appendChild(favicon)

const app = createApp(App)
app.use(createPinia())
app.use(i18n)
app.directive('tip', vTip)
app.config.errorHandler = (err, _instance, info) => {
  // eslint-disable-next-line no-console
  console.error('Rnote Vue error:', err, info)
}
app.mount('#app')

// Dev-only geometry helpers for automated browser tests (production builds
// drive everything through the DOM / file choosers and do not need them).
if (import.meta.env.DEV) {
  import('./compose/geometry').then((g) => {
    ;(window as any).G = g
  })
}
