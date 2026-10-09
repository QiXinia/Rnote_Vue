<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../../stores/app'
import RnoteIcon from '../icons/RnoteIcon.vue'
// Official upstream Rnote application icon
// (crates/rnote-ui/data/icons/scalable/apps/rnote.svg). Imported as an asset
// so Vite honours the base path on GitHub Pages and inlines it in the
// single-file CDN build.
import logoUrl from '../../assets/rnote-logo.svg'

const store = useAppStore()
const { t, locale, getLocaleMessage } = useI18n()

// Metadata mirrors crates/rnote-ui/src/dialogs/mod.rs (adw::AboutDialog) and
// the top-level meson.build / AUTHORS file.
const APP_VERSION = '0.15.0'
const AUTHOR_NAME = 'Felix Zwettler'
const DEVELOPERS = [
  'Felix Zwettler',
  'Óscar Fernández Díaz',
  'Seio Inoue',
  'Moritz Mechelk',
  'PhilProg',
  'Silvan Schmidt',
  'Doublonmousse',
  'RayJW'
]

const URL_WEBSITE = 'https://rnote.flxzt.net'
const URL_SUPPORT = 'https://github.com/flxzt/rnote/discussions'
const URL_ISSUES = 'https://github.com/flxzt/rnote/issues'
const URL_LICENSE = 'https://www.gnu.org/licenses/gpl-3.0.html'
const WEB_REPO = 'https://github.com/QiXinia/Rnote_Vue'
const WEB_DEMO = 'https://qixinia.github.io/Rnote_Vue/'

const links = computed(() => [
  { icon: 'globe', label: t('Website'), url: URL_WEBSITE },
  { icon: 'help', label: t('Support'), url: URL_SUPPORT },
  { icon: 'bug', label: t('Report an Issue'), url: URL_ISSUES }
])

// Upstream ships translator credits per locale via gettext("translator-credits").
// English leaves the untranslated placeholder, in which case the row is hidden.
// The value contains emails ("Name <mail@example.com>"); the '@' is linked-
// message syntax in the vue-i18n message compiler and throws a SyntaxError in
// the optimized production build, so read the raw (uncompiled) message instead
// of going through t().
const translators = computed(() => {
  const bucket = getLocaleMessage(locale.value) as Record<string, unknown>
  const v = typeof bucket['translator-credits'] === 'string'
    ? (bucket['translator-credits'] as string)
    : ''
  if (!v || v === 'translator-credits') return []
  return v
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
})
</script>

<template>
  <div class="dialog-backdrop" @click.self="store.closeDialog()">
    <div class="dialog about" role="dialog" aria-modal="true" aria-label="Rnote">
      <div class="dialog-body about-body">
        <img class="about-logo" :src="logoUrl" alt="Rnote" draggable="false" />
        <h1 class="about-name">Rnote</h1>
        <p class="about-version">{{ t('Version') }} {{ APP_VERSION }}</p>
        <p class="about-author">{{ AUTHOR_NAME }}</p>
        <p class="about-comments">{{ t('Sketch and take handwritten notes') }}</p>

        <div class="about-links">
          <a
            v-for="l in links"
            :key="l.url"
            class="about-link"
            :href="l.url"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="about-link-icon"><RnoteIcon :name="l.icon" /></span>
            <span class="about-link-label">{{ l.label }}</span>
          </a>
        </div>

        <section class="about-card">
          <h2>{{ t('Developers') }}</h2>
          <ul class="about-people">
            <li v-for="d in DEVELOPERS" :key="d">{{ d }}</li>
          </ul>
          <template v-if="translators.length">
            <h2>{{ t('Translators') }}</h2>
            <ul class="about-people">
              <li v-for="(p, i) in translators" :key="i">{{ p }}</li>
            </ul>
          </template>
          <h2>{{ t('License') }}</h2>
          <a
            class="about-license"
            :href="URL_LICENSE"
            target="_blank"
            rel="noopener noreferrer"
          >GNU General Public License v3.0</a>
        </section>

        <section class="about-card about-port">
          <h2>{{ t('Web Edition') }}</h2>
          <p class="about-port-desc">
            {{ t('An unofficial browser port of Rnote, rebuilt with Vue 3 and TypeScript. The original desktop application is created by Felix Zwettler and the Rnote contributors.') }}
          </p>
          <div class="about-port-links">
            <a :href="WEB_REPO" target="_blank" rel="noopener noreferrer">
              <RnoteIcon name="external" />{{ t('Web port source') }}
            </a>
            <a :href="WEB_DEMO" target="_blank" rel="noopener noreferrer">
              <RnoteIcon name="globe" />{{ t('Live demo') }}
            </a>
          </div>
        </section>
      </div>
      <div class="dialog-footer">
        <button class="btn suggested" @click="store.closeDialog()">{{ t('Close') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.about {
  width: min(400px, 94vw);
}
.about-body {
  text-align: center;
  padding: 24px 24px 16px;
}
.about-logo {
  width: 96px;
  height: 96px;
  margin: 0 auto;
  display: block;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.18));
  user-select: none;
}
.about-name {
  margin: 10px 0 2px;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.2px;
}
.about-version {
  margin: 0;
  font-size: 12.5px;
  color: var(--fg-muted, var(--text));
  opacity: 0.85;
}
.about-author {
  margin: 2px 0 0;
  font-size: 12px;
  opacity: 0.6;
}
.about-comments {
  font-size: 13px;
  line-height: 1.5;
  margin: 12px auto 16px;
  max-width: 300px;
  opacity: 0.8;
}

.about-links {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 14px;
}
.about-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 94px;
  padding: 8px 4px;
  border-radius: 10px;
  text-decoration: none;
  color: var(--text);
  transition: background-color 0.15s ease;
}
.about-link:hover {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.about-link-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--accent) 0.14, transparent);
  color: var(--accent);
}
.about-link-icon :deep(.icon) {
  width: 19px;
  height: 19px;
}
.about-link-label {
  font-size: 11px;
  opacity: 0.75;
}

.about-card {
  text-align: left;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 8px 14px 12px;
  margin: 10px 0;
  background: color-mix(in srgb, var(--popover-bg) 92%, transparent);
}
.about-card h2 {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  opacity: 0.6;
  margin: 10px 0 5px;
}
.about-people {
  list-style: none;
  margin: 0;
  padding: 0;
}
.about-people li {
  font-size: 12.5px;
  line-height: 1.5;
  padding: 1px 0;
}
.about-license {
  font-size: 12.5px;
  color: var(--accent);
  text-decoration: none;
}
.about-license:hover {
  text-decoration: underline;
}

.about-port-desc {
  font-size: 11.5px;
  line-height: 1.55;
  margin: 4px 0 9px;
  opacity: 0.78;
}
.about-port-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.about-port-links a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--accent);
  text-decoration: none;
  padding: 5px 10px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  transition: background-color 0.15s ease;
}
.about-port-links a:hover {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.about-port-links a :deep(.icon) {
  width: 15px;
  height: 15px;
}
</style>
