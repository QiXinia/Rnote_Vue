// Local autosave / recovery (web stand-in for rnote's autosave & workspace
// files). Small documents stay in localStorage for synchronous recovery;
// documents containing embedded images/PDFs use IndexedDB to avoid the ~5 MB
// localStorage quota while leaving a tiny recovery marker behind.

import type { EngineSnapshot } from '../engine'

const AUTOSAVE_KEY = 'rnote-vue:autosave'
const RECENT_KEY = 'rnote-vue:recent'
const SETTINGS_KEY = 'rnote-vue:settings'
const DB_NAME = 'rnote-vue'
const STORE_NAME = 'kv'
const AUTOSAVE_IDB_KEY = 'autosave'
const LOCAL_LIMIT = 3_000_000

export interface AutosaveRecord {
  at: number
  snapshot: EngineSnapshot
}

export interface RecentDoc {
  name: string
  savedAt: number
  snapshot: EngineSnapshot
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!indexedDB) {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function idbPut(value: AutosaveRecord): Promise<void> {
  const db = await openDb()
  try {
    await idbRequest(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value, AUTOSAVE_IDB_KEY))
  } finally {
    db.close()
  }
}

async function idbGet(): Promise<AutosaveRecord | null> {
  const db = await openDb()
  try {
    return (await idbRequest(db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(AUTOSAVE_IDB_KEY))) ?? null
  } finally {
    db.close()
  }
}

async function idbDelete(): Promise<void> {
  const db = await openDb()
  try {
    await idbRequest(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(AUTOSAVE_IDB_KEY))
  } finally {
    db.close()
  }
}

export async function saveAutosave(snapshot: EngineSnapshot): Promise<void> {
  const record: AutosaveRecord = { at: Date.now(), snapshot }
  const serialized = JSON.stringify(record)
  try {
    if (serialized.length <= LOCAL_LIMIT) {
      localStorage.setItem(AUTOSAVE_KEY, serialized)
      await idbDelete().catch(() => undefined)
      return
    }
  } catch (e) {
    // localStorage may be full or blocked; fall through to IndexedDB.
    console.warn('localStorage autosave unavailable, using IndexedDB', e)
  }

  try {
    await idbPut(record)
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ at: record.at, idb: true }))
  } catch (e) {
    console.warn('autosave failed', e)
  }
}

export function loadAutosave(): AutosaveRecord | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && parsed.snapshot ? parsed : null
  } catch {
    return null
  }
}

export async function loadAutosaveAsync(): Promise<AutosaveRecord | null> {
  try {
    const large = await idbGet()
    if (large) return large
  } catch {
    // Fall back to localStorage below.
  }
  return loadAutosave()
}

export async function clearAutosave(): Promise<void> {
  localStorage.removeItem(AUTOSAVE_KEY)
  await idbDelete().catch(() => undefined)
}

export function saveRecent(docs: RecentDoc[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(docs.slice(0, 20)))
  } catch (e) {
    // Recent thumbnails can be large; autosave is the authoritative recovery path.
    console.warn('recent save failed', e)
  }
}

export function loadRecent(): RecentDoc[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveUiSettings(settings: Record<string, unknown>) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}
export function loadUiSettings(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')
  } catch {
    return {}
  }
}
