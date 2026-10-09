import { createI18n } from 'vue-i18n'
import type { MessageResolver, PathValue } from 'vue-i18n'
import { languages, isRtl } from './languages'

export { languages, isRtl }
export type { LanguageOption } from './languages'

export type MessageBundle = Record<string, string>

// Eagerly bundle every locale so language switching is synchronous and the
// single-file CDN build stays self-contained. Source: upstream Rnote PO files.
const modules = import.meta.glob<{ default: MessageBundle }>('./locales/*.json', { eager: true })

const en: MessageBundle = modules['./locales/en.json'].default
const messages: Record<string, MessageBundle> = { en }
for (const path in modules) {
  const code = path.replace('./locales/', '').replace('.json', '')
  if (code !== 'en') messages[code] = modules[path].default
}

// Web-only extra strings (web-extra/<code>.json) supplement the upstream PO
// bundles for UI that has no desktop counterpart.
const extraModules = import.meta.glob<{ default: MessageBundle }>('./web-extra/*.json', { eager: true })
for (const path in extraModules) {
  const code = path.replace('./web-extra/', '').replace('.json', '')
  messages[code] = { ...(messages[code] ?? {}), ...extraModules[path].default }
}

const STORAGE_KEY = 'rnote-web-language'

export const availableCodes: string[] = languages.map((l) => l.code)

function resolveInitialLocale(): string {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && availableCodes.includes(saved)) return saved
  }
  const navLangs: readonly string[] = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const raw of navLangs) {
    const tag = (raw || '').replace(/_/g, '-')
    if (!tag) continue
    if (availableCodes.includes(tag)) return tag
    const lower = tag.toLowerCase()
    if (lower.startsWith('zh')) {
      if (/(tw|hk|mo|hant)/.test(lower)) return 'zh-Hant'
      return 'zh-Hans'
    }
    if (lower.startsWith('en')) return 'en'
    const primary = lower.split('-')[0]
    const match = availableCodes.find((c) => c.toLowerCase().split('-')[0] === primary)
    if (match) return match
  }
  return 'en'
}

// Desktop strings contain full stops (e.g. "...raw input.",
// "...algorithms. Results..."). The default vue-i18n resolver treats "." as a
// nested-object path separator, which breaks those keys. Resolve flat keys by
// exact match instead.
const flatResolver: MessageResolver = (obj, path): PathValue => {
  if (obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, path)) {
    return (obj as Record<string, PathValue>)[path]
  }
  return null
}

// GTK uses a leading/embedded underscore to mark the keyboard mnemonic (e.g.
// "_New", "Save _As", and the Chinese convention "新建文档 [_N]"). The web UI
// has no Alt+letter mnemonics, so strip the marker on every translated string.
// A doubled "__" is the escaped literal underscore and is preserved.
function stripMnemonic<T>(translated: T): T {
  if (typeof translated !== 'string') return translated
  return translated.replace(/__/g, '\u0000').replace(/_/g, '').replace(/\u0000/g, '_') as unknown as T
}

export const i18n = createI18n({
  legacy: false,
  locale: resolveInitialLocale(),
  fallbackLocale: 'en',
  messageResolver: flatResolver,
  flatJson: true,
  postTranslation: stripMnemonic,
  missingWarn: false,
  fallbackWarn: false,
  messages
})

type LocaleRef = { value: string }

export function currentLocale(): string {
  return (i18n.global.locale as unknown as LocaleRef).value
}

export function setLocale(code: string): void {
  if (!availableCodes.includes(code)) return
  ;(i18n.global.locale as unknown as LocaleRef).value = code
  try { localStorage.setItem(STORAGE_KEY, code) } catch { /* ignore */ }
  applyDocumentDirection(code)
}

export function applyDocumentDirection(code: string = currentLocale()): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = code
  document.documentElement.dir = isRtl(code) ? 'rtl' : 'ltr'
}

// Helpers for entries that carry a gettext msgctxt in the upstream sources.
export const msgctx = {
  cursorType: (name: string): string => `cursorType.${name}`,
  dotDistribution: (name: string): string => `dotDistribution.${name}`,
  colorPart: (name: string): string => `colorPart.${name}`,
  word: (name: string): string => `word.${name}`
}

applyDocumentDirection()
