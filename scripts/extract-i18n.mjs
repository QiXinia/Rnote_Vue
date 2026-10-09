#!/usr/bin/env node
/**
 * Extract gettext translations from the upstream Rnote (Rust/GTK) PO files and
 * emit vue-i18n compatible flat JSON locale bundles plus a languages.ts manifest.
 *
 * Source: ../../rnote-src/crates/rnote-ui/po/*.po (+ rnote.pot as English source)
 * Output: ../src/i18n/locales/*.json and ../src/i18n/languages.ts
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PO_DIR = join(__dirname, '..', '..', 'rnote-src', 'crates', 'rnote-ui', 'po')
const OUT_DIR = join(__dirname, '..', 'src', 'i18n', 'locales')
const LANGS_TS = join(__dirname, '..', 'src', 'i18n', 'languages.ts')

// Native (endonym) and English language names for every LINGUAS entry.
const LANGUAGE_INFO = {
  en:    { native: 'English',                 english: 'English' },
  ar:    { native: 'العربية',                 english: 'Arabic', rtl: true },
  bn:    { native: 'বাংলা',                    english: 'Bengali' },
  bs:    { native: 'Bosanski',                english: 'Bosnian' },
  cs:    { native: 'Čeština',                 english: 'Czech' },
  de:    { native: 'Deutsch',                 english: 'German' },
  enm:   { native: 'Middle English',          english: 'Middle English' },
  eo:    { native: 'Esperanto',               english: 'Esperanto' },
  es:    { native: 'Español',                 english: 'Spanish' },
  eu:    { native: 'Euskara',                 english: 'Basque' },
  fa:    { native: 'فارسی',                   english: 'Persian', rtl: true },
  fi:    { native: 'Suomi',                   english: 'Finnish' },
  fr:    { native: 'Français',                english: 'French' },
  he:    { native: 'עברית',                   english: 'Hebrew', rtl: true },
  hi:    { native: 'हिन्दी',                    english: 'Hindi' },
  hu:    { native: 'Magyar',                  english: 'Hungarian' },
  ia:    { native: 'Interlingua',             english: 'Interlingua' },
  id:    { native: 'Bahasa Indonesia',        english: 'Indonesian' },
  it:    { native: 'Italiano',                english: 'Italian' },
  ja:    { native: '日本語',                    english: 'Japanese' },
  ka:    { native: 'ქართული',                 english: 'Georgian' },
  ko:    { native: '한국어',                    english: 'Korean' },
  mk:    { native: 'Македонски',              english: 'Macedonian' },
  ml:    { native: 'മലയാളം',                  english: 'Malayalam' },
  ms:    { native: 'Bahasa Melayu',           english: 'Malay' },
  nb_NO: { native: 'Norsk Bokmål',            english: 'Norwegian Bokmål' },
  ne:    { native: 'नेपाली',                   english: 'Nepali' },
  nl:    { native: 'Nederlands',              english: 'Dutch' },
  pl:    { native: 'Polski',                  english: 'Polish' },
  pt:    { native: 'Português',               english: 'Portuguese' },
  pt_BR: { native: 'Português (Brasil)',      english: 'Portuguese (Brazil)' },
  ro:    { native: 'Română',                  english: 'Romanian' },
  ru:    { native: 'Русский',                 english: 'Russian' },
  sl:    { native: 'Slovenščina',             english: 'Slovenian' },
  sv:    { native: 'Svenska',                 english: 'Swedish' },
  ta:    { native: 'தமிழ்',                    english: 'Tamil' },
  th:    { native: 'ไทย',                     english: 'Thai' },
  tr:    { native: 'Türkçe',                  english: 'Turkish' },
  uk:    { native: 'Українська',              english: 'Ukrainian' },
  vi:    { native: 'Tiếng Việt',              english: 'Vietnamese' },
  zh_CN: { native: '简体中文（中国）',           english: 'Chinese (China)' },
  zh_HK: { native: '繁體中文（香港）',           english: 'Chinese (Hong Kong)' },
  zh_Hans: { native: '简体中文',                english: 'Chinese (Simplified)' },
  zh_Hant: { native: '繁體中文',                english: 'Chinese (Traditional)' },
  zh_SG: { native: '简体中文（新加坡）',          english: 'Chinese (Singapore)' },
  zh_TW: { native: '繁體中文（台灣）',           english: 'Chinese (Taiwan)' }
}

function unquote(line) {
  const first = line.indexOf('"')
  const last = line.lastIndexOf('"')
  if (first === -1 || last <= first) return ''
  return line.slice(first + 1, last)
}

function unescape(s) {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '\\') {
      const n = s[++i]
      if (n === 'n') out += '\n'
      else if (n === 't') out += '\t'
      else if (n === 'r') out += '\r'
      else if (n === '"') out += '"'
      else if (n === '\\') out += '\\'
      else if (n === undefined) { /* trailing slash */ }
      else out += n
    } else out += c
  }
  return out
}

function newEntry() {
  return {
    flags: new Set(),
    ctxt: '',
    msgid: [],
    msgidPlural: null,
    msgstr: [],
    plural: {},
    obsolete: false,
    hasPlural: false,
    hasContext: false
  }
}

function parsePo(text) {
  const lines = text.split('\n')
  const entries = []
  let cur = newEntry()
  let target = null

  const flush = () => {
    if (cur.msgid.length > 0 || cur.msgidPlural) entries.push(cur)
    cur = newEntry()
    target = null
  }

  for (const raw of lines) {
    const line = raw
    if (line.startsWith('#~')) { cur.obsolete = true; continue }
    if (line.startsWith('#')) {
      if (line.startsWith('#,')) {
        line.slice(2).split(',').map((s) => s.trim()).filter(Boolean).forEach((f) => cur.flags.add(f))
      }
      continue
    }
    if (line.trim() === '') { flush(); continue }
    if (line.startsWith('msgctxt ')) { cur.hasContext = true; cur.ctxt = unescape(unquote(line)); target = 'ctxt'; continue }
    if (line.startsWith('msgid_plural ')) { cur.hasPlural = true; cur.msgidPlural = unescape(unquote(line)); target = 'msgidPlural'; continue }
    if (line.startsWith('msgid ')) { cur.msgid.push(unescape(unquote(line))); target = 'msgid'; continue }
    const mPlural = line.match(/^msgstr\[(\d+)\]\s*(.*)$/)
    if (mPlural) { cur.plural[+mPlural[1]] = unescape(unquote(mPlural[2])); target = 'plural' + mPlural[1]; continue }
    if (line.startsWith('msgstr ')) { cur.msgstr.push(unescape(unquote(line))); target = 'msgstr'; continue }
    if (line.trimStart().startsWith('"')) {
      const val = unescape(unquote(line))
      if (target === 'msgid') cur.msgid.push(val)
      else if (target === 'msgstr') cur.msgstr.push(val)
      else if (target === 'msgidPlural') cur.msgidPlural += val
      else if (target === 'ctxt') cur.ctxt += val
      else if (target && target.startsWith('plural')) cur.plural[+target.slice(6)] += val
    }
  }
  flush()
  return entries
}

// Map gettext msgctxt to a flat namespace prefix used as the vue-i18n key.
const CONTEXT_PREFIX = {
  '': '',
  'a cursor type': 'cursorType.',
  'A variant of the textured pen texture distribution': 'dotDistribution.',
  'Drawing with a textured pen, how the dots of the texture are distributed': '',
  'part of string representation of a color': 'colorPart.',
  'used in string representation of the current selected color': 'colorPart.',
  'as in computer chip': 'word.',
  'as in plant': 'word.',
  'as in terminal software': 'word.'
}

function buildMap(entries, isSource) {
  const map = {}
  let skippedContext = 0
  for (const e of entries) {
    if (e.obsolete) continue
    const msgid = e.msgid.join('')
    if (!msgid) continue // header
    let keyPrefix = ''
    if (e.hasContext) {
      if (Object.prototype.hasOwnProperty.call(CONTEXT_PREFIX, e.ctxt)) {
        keyPrefix = CONTEXT_PREFIX[e.ctxt]
      } else {
        skippedContext++
        continue
      }
    }
    if (!isSource && e.flags.has('fuzzy')) continue
    const key = keyPrefix + msgid
    if (e.hasPlural) {
      if (isSource) { map[key] = msgid; continue }
      const singular = e.plural[0]
      if (singular) map[key] = singular
      continue
    }
    const str = e.msgstr.join('')
    if (isSource) map[key] = msgid
    else if (str) map[key] = str
  }
  return { map, skippedContext }
}

function sortedStringify(obj) {
  const keys = Object.keys(obj).sort()
  const lines = keys.map((k) => `${JSON.stringify(k)}: ${JSON.stringify(obj[k])}`)
  return `{\n${lines.join(',\n')}\n}\n`
}

if (!existsSync(PO_DIR)) {
  console.error(`PO directory not found: ${PO_DIR}`)
  process.exit(1)
}
mkdirSync(OUT_DIR, { recursive: true })

// Web-only supplemental strings that have no counterpart in the upstream PO
// (the in-app language switcher, workspace stats, web About text, etc.). These
// are hand-maintained per locale in src/i18n/web-extra; official PO translations
// always take precedence and are never overwritten.
const EXTRA_DIR = join(__dirname, '..', 'src', 'i18n', 'web-extra')
function loadExtra(localeCode) {
  const p = join(EXTRA_DIR, `${localeCode}.json`)
  if (!existsSync(p)) return {}
  return JSON.parse(readFileSync(p, 'utf8'))
}
function mergeExtra(map, localeCode) {
  for (const [k, v] of Object.entries(loadExtra(localeCode))) {
    if (!Object.prototype.hasOwnProperty.call(map, k)) map[k] = v
  }
}

// English source from the POT template, plus the English web-only bundle.
const pot = readFileSync(join(PO_DIR, 'rnote.pot'), 'utf8')
const { map: enMap, skippedContext: enCtx } = buildMap(parsePo(pot), true)
mergeExtra(enMap, 'en')
writeFileSync(join(OUT_DIR, 'en.json'), sortedStringify(enMap))
console.log(`en.json: ${Object.keys(enMap).length} source strings (${enCtx} context-only skipped)`)

// Every translated language.
const poFiles = readdirSync(PO_DIR).filter((f) => f.endsWith('.po') && f !== 'rnote.pot')
let totalLangs = 0
const manifest = []
for (const file of poFiles) {
  const poCode = file.replace(/\.po$/, '')
  const localeCode = poCode.replace(/_/g, '-')
  const text = readFileSync(join(PO_DIR, file), 'utf8')
  const { map } = buildMap(parsePo(text), false)
  mergeExtra(map, localeCode)
  if (Object.keys(map).length === 0) {
    console.warn(`  ${localeCode}: no translations, skipping`)
    continue
  }
  writeFileSync(join(OUT_DIR, `${localeCode}.json`), sortedStringify(map))
  totalLangs++
  const info = LANGUAGE_INFO[poCode]
  if (!info) console.warn(`  missing language info for ${poCode}`)
  manifest.push({ code: localeCode, poCode, count: Object.keys(map).length, info })
}

// languages.ts (en first, then alphabetical by English name).
const rows = [{ code: 'en', ...LANGUAGE_INFO.en, count: Object.keys(enMap).length }]
manifest
  .filter((m) => m.info)
  .sort((a, b) => a.info.english.localeCompare(b.info.english))
  .forEach((m) => rows.push({ code: m.code, ...m.info, count: m.count }))

const ts = `// AUTO-GENERATED by scripts/extract-i18n.mjs — do not edit by hand.
// Language list and translations are derived from the upstream Rnote PO files.
export interface LanguageOption {
  code: string
  nativeName: string
  englishName: string
  rtl?: boolean
  /** number of translated strings available in the bundle */
  count: number
}

export const languages: LanguageOption[] = [
${rows.map((r) => `  { code: '${r.code}', nativeName: ${JSON.stringify(r.native)}, englishName: ${JSON.stringify(r.english)}${r.rtl ? ', rtl: true' : ''}, count: ${r.count} }`).join(',\n')}
]

export function isRtl(code: string): boolean {
  return languages.some((l) => l.code === code && l.rtl)
}

export function findLanguage(code: string): LanguageOption | undefined {
  return languages.find((l) => l.code === code)
}
`
writeFileSync(LANGS_TS, ts)
console.log(`\nGenerated ${totalLangs} language bundles + languages.ts (${rows.length} selectable languages incl. English)`)
