// Central system-font handling for canvas text, the contenteditable edit
// overlay, and SVG / foreignObject export. Generic families (serif / sans-serif
// / monospace / cursive) expand into cross-platform stacks covering Latin and
// CJK system fonts so documents render consistently on Linux / Windows / macOS
// / Android / iOS; concrete family names are quoted and given a matching
// generic fallback. Optional Local Font Access (queryLocalFonts, Chromium)
// enumeration is exposed for the typewriter panel and degrades gracefully.

export const SANS_STACK = [
  'system-ui',
  '-apple-system',
  'Segoe UI',
  'Cantarell',
  'Roboto',
  'Helvetica Neue',
  'Arial',
  'PingFang SC',
  'Hiragino Sans GB',
  'Microsoft YaHei',
  'Noto Sans CJK SC',
  'Source Han Sans SC',
  'WenQuanYi Micro Hei',
  'sans-serif'
].join(',')

export const SERIF_STACK = [
  'Iowan Old Style',
  'Apple Garamond',
  'Baskerville',
  'Times New Roman',
  'Georgia',
  'Songti SC',
  'SimSun',
  'NSimSun',
  'FangSong',
  'Noto Serif CJK SC',
  'Source Han Serif SC',
  'serif'
].join(',')

export const MONO_STACK = [
  'ui-monospace',
  'SF Mono',
  'Menlo',
  'Monaco',
  'Consolas',
  'Liberation Mono',
  'Courier New',
  'Noto Sans Mono CJK SC',
  'monospace'
].join(',')

export const CURSIVE_STACK = [
  'Segoe Script',
  'Comic Sans MS',
  'Bradley Hand',
  'Chalkboard SE',
  'Kaiti SC',
  'STKaiti',
  'KaiTi',
  'DFKai-SB',
  'cursive'
].join(',')

export const UI_FONT_STACK = SANS_STACK

const GENERIC_STACKS: Record<string, string> = {
  serif: SERIF_STACK,
  'sans-serif': SANS_STACK,
  sans: SANS_STACK,
  monospace: MONO_STACK,
  mono: MONO_STACK,
  cursive: CURSIVE_STACK,
  fantasy: SANS_STACK,
  'system-ui': SANS_STACK
}

// Classify a concrete family name to pick the right generic fallback.
function genericFor(name: string): string {
  const n = name.toLowerCase()
  if (/mono|consolas|menlo|courier|sf mono|jetbrains|fira code/.test(n)) return MONO_STACK
  if (/kai|kaiti|script|hand|chalk|cursive|comic|cai|行|楷/.test(n)) return CURSIVE_STACK
  if (/song|sun|serif|times|georgia|baskerville|garamond|ming|宋|仿/.test(n)) return SERIF_STACK
  return SANS_STACK
}

function quoteName(name: string): string {
  const t = name.trim().replace(/^['"]|['"]$/g, '').trim()
  // generic keywords are left unquoted so the browser resolves them
  if (/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|inherit)$/i.test(t)) return t
  return /[\s"'(),]/.test(t) ? `"${t.replace(/"/g, "'")}"` : t
}

/**
 * Turn a stored font-family value (a generic keyword, a single family, or a
 * comma list) into a CSS / canvas `font-family` declaration backed by system
 * fonts and a safe generic fallback.
 */
export function cssFamily(family: string | undefined | null): string {
  if (!family) return SANS_STACK
  const raw = family.trim()
  if (!raw) return SANS_STACK
  // single generic keyword?
  if (GENERIC_STACKS[raw.toLowerCase()]) return GENERIC_STACKS[raw.toLowerCase()]
  // could itself be a comma list
  const names = raw.split(',').map((s) => s.trim()).filter(Boolean)
  if (names.length === 1) {
    const only = names[0].replace(/^['"]|['"]$/g, '')
    if (GENERIC_STACKS[only.toLowerCase()]) return GENERIC_STACKS[only.toLowerCase()]
    return `${quoteName(only)},${genericFor(only)}`
  }
  const quoted = names.map(quoteName)
  // ensure a generic tail
  const last = names[names.length - 1].replace(/^['"]|['"]$/g, '').toLowerCase()
  if (!GENERIC_STACKS[last]) quoted.push(genericFor(names[0]))
  return quoted.join(',')
}

export interface FontChoice {
  label: string
  value: string
}

// Curated, cross-platform system fonts (Latin + CJK). Missing names simply
// fall back through cssFamily(), so the list is safe to show on every OS.
export const FONT_CHOICES: FontChoice[] = [
  { label: 'System Sans-Serif', value: 'sans-serif' },
  { label: 'System Serif', value: 'serif' },
  { label: 'System Monospace', value: 'monospace' },
  { label: 'System Handwriting', value: 'cursive' },
  { label: 'Microsoft YaHei', value: 'Microsoft YaHei' },
  { label: 'PingFang SC', value: 'PingFang SC' },
  { label: 'Hiragino Sans GB', value: 'Hiragino Sans GB' },
  { label: 'Noto Sans CJK SC', value: 'Noto Sans CJK SC' },
  { label: 'SimHei', value: 'SimHei' },
  { label: 'SimSun', value: 'SimSun' },
  { label: 'NSimSun', value: 'NSimSun' },
  { label: 'FangSong', value: 'FangSong' },
  { label: 'KaiTi', value: 'KaiTi' },
  { label: 'STKaiti', value: 'STKaiti' },
  { label: 'STSong', value: 'STSong' },
  { label: 'Segoe UI', value: 'Segoe UI' },
  { label: 'Cantarell', value: 'Cantarell' },
  { label: 'Inter', value: 'Inter' },
  { label: 'Roboto', value: 'Roboto' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Helvetica', value: 'Helvetica' },
  { label: 'Verdana', value: 'Verdana' },
  { label: 'Tahoma', value: 'Tahoma' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Courier New', value: 'Courier New' },
  { label: 'Comic Sans MS', value: 'Comic Sans MS' }
]

/**
 * Enumerate locally installed fonts via the Local Font Access API
 * (Chromium, gated behind a permission). Returns [] when unsupported or
 * denied — callers should keep using FONT_CHOICES in that case.
 */
export async function detectLocalFonts(): Promise<string[]> {
  try {
    const w = window as any
    if (typeof w.queryLocalFonts !== 'function') return []
    const fonts = await w.queryLocalFonts()
    const names = new Set<string>()
    for (const f of fonts ?? []) {
      const fam = f.family || f.name
      if (fam) names.add(String(fam).replace(/^['"]|['"]$/g, ''))
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}
