import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { i18n } from './i18n'
import { vTip } from './ui/tooltip/rn-tooltip'
import './styles/adwaita.css'

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
