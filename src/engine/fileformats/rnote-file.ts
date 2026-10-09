// Open / save the native desktop Rnote 0.15 container: a gzip-compressed JSON
// document `{ version: "0.15.0", data: { engine_snapshot } }`. Files written by
// the web app use desktop-export.ts so they open directly in desktop Rnote, and
// they are read back through desktop-import.ts (true bidirectional compat).
// Older rnote-vue web archives (`{ rnote_vue, engine_snapshot }`) remain
// readable.

import type { Engine, EngineSnapshot } from '../engine'
import { gzipCompress, gzipDecompress, isGzip, downloadBytes, readFileBytes } from './gzip'
import { mapDesktopSnapshot, mapDesktopSnapshotAsync } from './desktop-import'
import { buildDesktopSnapshot, DESKTOP_RNOTE_VERSION } from './desktop-export'

export const RNOTE_VUE_MAJOR = 0
export const RNOTE_VUE_MINOR = 15
export const RNOTE_VUE_PATCH = 0

export async function saveRnoteFile(engine: Engine, filename: string): Promise<void> {
  const engineSnapshot = await buildDesktopSnapshot(engine.snapshot())
  const payload = {
    version: DESKTOP_RNOTE_VERSION,
    data: { engine_snapshot: engineSnapshot }
  }
  const json = JSON.stringify(payload)
  let bytes: Uint8Array
  let name = filename
  try {
    bytes = await gzipCompress(json)
    if (!name.toLowerCase().endsWith('.rnote')) name += '.rnote'
  } catch {
    // CompressionStream unavailable: fall back to plain JSON.
    bytes = new TextEncoder().encode(json)
    if (!name.toLowerCase().endsWith('.json')) name += '.rnote.json'
  }
  downloadBytes(name, bytes, 'application/gzip')
  engine.markSaved(name.replace(/\.rnote(\.json)?$/, ''))
}

// Web-only full-fidelity archive (keeps pens config and web extensions). Used by
// tests and available for power users; the regular Save action emits the native
// desktop format.
export async function saveRnoteVueArchive(engine: Engine, filename: string): Promise<Uint8Array> {
  const payload = {
    engine_snapshot: engine.snapshot(),
    rnote_vue: true as const,
    app_version: '0.15.0-vue'
  }
  return gzipCompress(JSON.stringify(payload))
}

export async function openRnoteFile(file: File): Promise<{ snapshot: EngineSnapshot; source: string }> {
  const bytes = await readFileBytes(file)
  let text: string
  if (isGzip(bytes)) {
    text = await gzipDecompress(bytes)
  } else {
    text = new TextDecoder().decode(bytes)
  }
  const parsed = JSON.parse(text)
  // Web saves `{ rnote_vue, engine_snapshot }`; desktop 0.15 saves
  // `{ version: "0.15.0", data: { engine_snapshot } }` (gzip JSON).
  const desktopSnapshot = parsed?.data?.engine_snapshot
  const vueSnapshot: EngineSnapshot | undefined = parsed?.engine_snapshot
  if (parsed?.rnote_vue && vueSnapshot) {
    return { snapshot: vueSnapshot, source: 'rnote-vue' }
  }
  if (desktopSnapshot && !parsed?.rnote_vue) {
    // desktop rnote file — best-effort schema mapping
    return { snapshot: await mapDesktopSnapshotAsync(desktopSnapshot), source: 'desktop-rnote' }
  }
  // Legacy desktop containers (pre-0.9): `{ version, data: { document,
  // stroke_components | store_snapshot.stroke_components, ... } }`.
  const legacyData = parsed?.data
  if (
    legacyData &&
    !parsed?.rnote_vue &&
    (legacyData.stroke_components ||
      legacyData.store_snapshot?.stroke_components ||
      legacyData.document)
  ) {
    return { snapshot: await mapDesktopSnapshotAsync(legacyData), source: 'desktop-rnote' }
  }
  if (vueSnapshot) {
    // web snapshot without the marker (older export)
    return { snapshot: vueSnapshot, source: 'rnote-vue' }
  }
  // last resort: maybe the engine snapshot is the whole document
  if (parsed?.stroke_components || parsed?.store?.stroke_components) {
    return { snapshot: await mapDesktopSnapshotAsync(parsed), source: 'desktop-rnote' }
  }
  return { snapshot: parsed as EngineSnapshot, source: 'rnote-vue' }
}
