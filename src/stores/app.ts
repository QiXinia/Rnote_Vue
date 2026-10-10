import { defineStore } from 'pinia'
import { markRaw, shallowRef, ref, computed, reactive, watch } from 'vue'
import { Engine, type EngineSnapshot } from '../engine/engine'
import { PenStyle } from '../engine/pens/pensconfig'
import { Vec2 } from '../compose/geometry'
import { loadAutosave, loadAutosaveAsync, saveAutosave, loadUiSettings, saveUiSettings } from '../engine/fileformats/autosave'
import { saveRnoteFile, openRnoteFile } from '../engine/fileformats/rnote-file'
import { importXoppFile, exportXopp } from '../engine/fileformats/xopp'
import { exportBitmap, exportSVG, printDocument } from '../engine/fileformats/export'
import { importImageFile, importTextFile } from '../engine/fileformats/import'
import { exportPDF, importPdf, defaultPdfImportOptions, type PdfImportOptions } from '../engine/fileformats/pdf'
import { i18n } from '../i18n'

const tt = (key: string, named?: Record<string, unknown>) => i18n.global.t(key, named ?? {})

export interface Tab {
  id: number
  engine: Engine
  name: string
  dirty: boolean
}

export type DialogName =
  | 'export'
  | 'import'
  | 'about'
  | 'shortcuts'
  | 'document-settings'
  | 'confirm-clear'
  | 'confirm-new'
  | 'workspaces'
  | null

let tabCounter = 1

export const useAppStore = defineStore('app', () => {
  const tabs = shallowRef<Tab[]>([])
  const activeId = ref<number>(-1)
  // When set, the Close Tab confirmation dialog is open for this tab id.
  const closingTabId = ref<number | null>(null)
  // On phones / coarse pointers start with the options sheet collapsed so the
  // canvas gets the space; the sidebar toggle reopens it.
  const isCompact =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 640)
  const sidebarOpen = ref(!isCompact)
  const workspaceOpen = ref(false)
  // Which tab the left sidebar shows ('workspace' browser or 'settings' panel).
  const sidebarTab = ref<'workspace' | 'settings'>('workspace')
  const focusMode = ref(false)
  const theme = ref<'light' | 'dark' | 'default'>('default')
  const dialog = ref<DialogName>(null)
  // Canvas right-click context menu (Copy/Cut/Paste), viewport coordinates.
  const contextMenu = reactive({ open: false, x: 0, y: 0, docX: 0, docY: 0 })
  function openContextMenu(x: number, y: number, docX = 0, docY = 0) {
    contextMenu.x = x
    contextMenu.y = y
    contextMenu.docX = docX
    contextMenu.docY = docY
    contextMenu.open = true
  }
  function closeContextMenu() {
    contextMenu.open = false
  }

  // A staged PDF/XOPP file awaiting the import-preferences dialog.
  const pendingImport = shallowRef<{ kind: 'pdf' | 'xopp'; file: File } | null>(null)
  function stageImport(kind: 'pdf' | 'xopp', file: File) {
    pendingImport.value = { kind, file }
    dialog.value = 'import'
  }
  function cancelImport() {
    dialog.value = null
    pendingImport.value = null
  }
  async function confirmPdfImport(opts: PdfImportOptions) {
    const p = pendingImport.value
    dialog.value = null
    pendingImport.value = null
    if (!p || !engine.value) return
    try {
      const res = await importPdf(engine.value, p.file, opts)
      pushToast(tt('Imported PDF ({n} pages)', { n: res.pages }))
    } catch (e) {
      pushToast(tt('PDF import failed'))
      console.error(e)
    }
  }
  async function confirmXoppImport(dpi: number) {
    const p = pendingImport.value
    dialog.value = null
    pendingImport.value = null
    if (!p) return
    try {
      const { snapshot, title } = await importXoppFile(p.file, dpi)
      createTab(snapshot, title)
      pushToast(tt('Imported Xournal++ .xopp'))
    } catch (e) {
      pushToast(tt('XOPP import failed'))
      console.error(e)
    }
  }
  const toasts = ref<{ id: number; message: string }[]>([])
  const uiTick = ref(0)
  const canvasReady = ref(false)
  const fileInput = ref<HTMLInputElement | null>(null)

  // ---- General preferences (persisted, shared with the canvas cursor) ----
  const defaultGeneral = {
    autosave: true,
    autosaveInterval: 120,
    showScrollbars: true,
    optimizeEPD: false,
    inertialScrolling: true,
    regularCursor: 'cursor-dot-medium',
    showDrawingCursor: true,
    drawingCursor: 'cursor-dot-small'
  }
  type GeneralSettings = typeof defaultGeneral
  function loadGeneral(): GeneralSettings {
    try {
      return { ...defaultGeneral, ...JSON.parse(localStorage.getItem('rnote-web-general') || '{}') }
    } catch {
      return { ...defaultGeneral }
    }
  }
  const general = reactive<GeneralSettings>(loadGeneral())
  watch(
    general,
    () => {
      localStorage.setItem('rnote-web-general', JSON.stringify(general))
      document.documentElement.classList.toggle('epd-optimized', general.optimizeEPD)
      document.documentElement.classList.toggle('hide-scrollbars', !general.showScrollbars)
    },
    { deep: true }
  )

  const activeTab = computed(() => tabs.value.find((t) => t.id === activeId.value) ?? null)
  const engine = computed<Engine | null>(() => activeTab.value?.engine ?? null)

  function wireEngine(eng: Engine) {
    eng.onChange = () => {
      // Recreate the tab entry so the shallowRef triggers a re-render of the
      // dirty dot; mutating the plain object in place would be invisible.
      const idx = tabs.value.findIndex((t) => t.engine === eng)
      if (idx >= 0) {
        const arr = [...tabs.value]
        arr[idx] = { ...arr[idx], dirty: eng.dirty }
        tabs.value = arr
      }
      uiTick.value++
    }
    eng.onToast = (msg) => pushToast(msg)
  }

  function createTab(snapshot?: EngineSnapshot, name?: string): Tab {
    const eng = new Engine()
    markRaw(eng)
    wireEngine(eng)
    if (snapshot) {
      eng.loadSnapshot(snapshot, false)
      // A desktop .rnote carries its own surface camera and is restored
      // verbatim (same view as the desktop). Imports without a camera (PDF /
      // image) get a one-shot fit once the real viewport size is known.
      if (!snapshot.camera) eng.pendingFit = 'content'
    }
    // A blank tab keeps the desktop default camera (infinite canvas, origin at
    // the 96px overshoot), exactly like the desktop.
    const tab: Tab = { id: tabCounter++, engine: eng, name: name ?? 'New Document', dirty: false }
    tabs.value = [...tabs.value, tab]
    activeId.value = tab.id
    uiTick.value++
    return tab
  }

  function newTab() {
    disarmStartupRestore()
    createTab()
  }

  function selectTab(id: number) {
    if (id === activeId.value) return
    activeId.value = id
    uiTick.value++
  }

  // Porting active-tab-move-left/right actions: reorder the tab strip.
  function moveTab(id: number, dir: -1 | 1) {
    const arr = [...tabs.value]
    const i = arr.findIndex((t) => t.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= arr.length) return
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
    tabs.value = arr
    uiTick.value++
  }

  // Drag-and-drop reordering, porting AdwTabView tab reordering.
  function reorderTab(fromId: number, toId: number) {
    if (fromId === toId) return
    const arr = [...tabs.value]
    const from = arr.findIndex((t) => t.id === fromId)
    const to = arr.findIndex((t) => t.id === toId)
    if (from < 0 || to < 0) return
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    tabs.value = arr
    uiTick.value++
  }

  function forceCloseTab(id: number) {
    disarmStartupRestore()
    const idx = tabs.value.findIndex((t) => t.id === id)
    if (idx < 0) return
    const next = tabs.value.filter((t) => t.id !== id)
    tabs.value = next
    if (activeId.value === id) {
      activeId.value = next.length ? next[Math.min(idx, next.length - 1)].id : -1
    }
    if (next.length === 0) createTab()
    uiTick.value++
  }

  // Porting adw TabView close-page: a tab with unsaved changes raises the Close
  // Tab dialog (Cancel / Discard / Save); a clean tab closes directly.
  function closeTab(id: number) {
    const tab = tabs.value.find((t) => t.id === id)
    if (!tab) return
    if (tab.dirty) {
      closingTabId.value = id
      return
    }
    forceCloseTab(id)
  }
  function cancelCloseTab() {
    closingTabId.value = null
  }
  function discardAndCloseTab() {
    const id = closingTabId.value
    closingTabId.value = null
    if (id != null) forceCloseTab(id)
  }
  async function saveAndCloseTab() {
    const id = closingTabId.value
    const tab = id != null ? tabs.value.find((t) => t.id === id) : null
    if (!tab) {
      closingTabId.value = null
      return
    }
    try {
      await saveRnoteFile(tab.engine, tab.name)
      tab.name = tab.engine.fileName
      tab.dirty = false
      closingTabId.value = null
      forceCloseTab(tab.id)
    } catch (e) {
      pushToast('Save failed')
      console.error(e)
    }
  }

  function setPen(pen: PenStyle) {
    window.dispatchEvent(new Event('rnote:close-popovers'))
    engine.value?.setPen(pen)
    uiTick.value++
  }

  let toastId = 1
  function pushToast(message: string, timeout = 2600) {
    const id = toastId++
    toasts.value = [...toasts.value, { id, message }]
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, timeout)
  }

  function openDialog(name: DialogName) {
    dialog.value = name
  }
  function closeDialog() {
    dialog.value = null
  }

  function setTheme(t: 'light' | 'dark' | 'default') {
    theme.value = t
    applyTheme()
    saveUiSettings({ theme: t, sidebarOpen: sidebarOpen.value, workspaceOpen: workspaceOpen.value })
  }

  function applyTheme() {
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
    const dark = theme.value === 'dark' || (theme.value === 'default' && prefersDark)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    return dark
  }

  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value
  }
  function toggleWorkspace() {
    workspaceOpen.value = !workspaceOpen.value
  }
  // Desktop app-menu "Settings" reveals the left sidebar on the Settings tab.
  function openSettings() {
    sidebarTab.value = 'settings'
    workspaceOpen.value = true
  }
  function openWorkspace() {
    sidebarTab.value = 'workspace'
    workspaceOpen.value = true
  }
  function toggleFocus() {
    focusMode.value = !focusMode.value
  }

  // Touch / stylus input: when enabled a single finger draws (two fingers
  // always pan / pinch); when disabled any touch pans the canvas.
  function touchDrawingEnabled(): boolean {
    return engine.value?.settings.touchDrawing ?? true
  }
  function toggleTouchDrawing() {
    if (engine.value) {
      engine.value.settings.touchDrawing = !engine.value.settings.touchDrawing
      engine.value.notify()
      bump()
    }
  }

    function autosave() {
    let enabled = true
    try {
      enabled = JSON.parse(localStorage.getItem('rnote-web-general') || '{}').autosave ?? true
    } catch { /* keep default */ }
    if (enabled && engine.value) saveAutosave(engine.value.snapshot())
  }

  // Startup session restore is only valid until the user performs an explicit
  // document action. The IndexedDB restore is async and can resolve after the
  // user has opened/imported a file; without this gate it would create a
  // "Recovered Document" tab and hijack the workspace.
  let startupRestoreArmed = true
  function disarmStartupRestore() {
    startupRestoreArmed = false
  }

  function restoreLastSession(): boolean {
    const saved = loadAutosave()
    const settings = loadUiSettings()
    if (settings.theme) theme.value = settings.theme as 'light' | 'dark' | 'default'
    if (typeof settings.sidebarOpen === 'boolean') sidebarOpen.value = settings.sidebarOpen
    applyTheme()
    if (startupRestoreArmed && saved?.snapshot) {
      createTab(saved.snapshot, 'Recovered Document')
      return true
    }
    return !startupRestoreArmed
  }

  async function restoreLastSessionAsync(): Promise<boolean> {
    const saved = await loadAutosaveAsync()
    if (startupRestoreArmed && saved?.snapshot) {
      createTab(saved.snapshot, 'Recovered Document')
      return true
    }
    // User already acted while the async read was in flight: consider startup
    // handled so onMounted does not add a blank tab on top of their document.
    return !startupRestoreArmed
  }

  function bump() {
    uiTick.value++
  }

  // ---- file actions ----
  function pickFiles(accept: string, multiple: boolean): Promise<FileList | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = accept
      input.multiple = multiple
      input.onchange = () => {
        input.remove()
        resolve(input.files)
      }
      // Attach the transient input so browser/OS file chooser automation can
      // address it; it stays invisible and removes itself after selection.
      input.style.display = 'none'
      document.body.appendChild(input)
      input.click()
    })
  }

  async function saveDocument(saveAs = false) {
    const tab = activeTab.value
    if (!tab) return
    try {
      await saveRnoteFile(tab.engine, tab.name)
      tab.name = tab.engine.fileName
      tab.dirty = false
      pushToast(saveAs ? 'Saved a copy' : 'Document saved')
    } catch (e) {
      pushToast('Save failed')
      console.error(e)
    }
  }

  async function openDocument() {
    disarmStartupRestore()
    const files = await pickFiles('.rnote,.rnote.json,.xopp,.txt,application/gzip,application/json,text/plain', false)
    if (!files || !files[0]) return
    try {
      pushToast(tt('Opening file…'))
      const lower = files[0].name.toLowerCase()
      if (lower.endsWith('.xopp')) {
        stageImport('xopp', files[0])
        return
      }
      if (lower.endsWith('.txt')) {
        const res = await importTextFile(engine.value!, files[0])
        if (res.added) pushToast(tt('Imported text'))
        return
      }
      const { snapshot, source } = await openRnoteFile(files[0])
      const name = files[0].name.replace(/\.(rnote|json)$/, '')
      createTab(snapshot, name)
      // Desktop closes the workspace overlay once a document is opened.
      workspaceOpen.value = false
      pushToast(source === 'desktop-rnote' ? 'Opened desktop .rnote (best-effort mapping)' : 'Document opened')
    } catch (e) {
      pushToast('Could not open file')
      console.error(e)
    }
  }

  async function importFiles() {
    disarmStartupRestore()
    const files = await pickFiles('image/*,.svg,.rnote,.xopp,.txt,.pdf,application/pdf,text/plain', true)
    if (!files || !files.length) return
    for (const f of Array.from(files)) {
      if (f.name.toLowerCase().endsWith('.rnote')) {
        const { snapshot } = await openRnoteFile(f)
        createTab(snapshot, f.name.replace(/\.rnote$/, ''))
        continue
      }
      if (f.name.toLowerCase().endsWith('.xopp')) {
        stageImport('xopp', f)
        continue
      }
      if (f.name.toLowerCase().endsWith('.txt')) {
        await importTextFile(engine.value!, f)
        continue
      }
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        stageImport('pdf', f)
        continue
      }
      const res = await importImageFile(engine.value!, f)
      if (res.kind === 'unknown') pushToast(tt('Unsupported file: {name}', { name: f.name }))
    }
    pushToast(tt('Import finished'))
  }

  async function importFileAt(file: File, at?: { x: number; y: number }) {
    disarmStartupRestore()
    const eng = engine.value
    if (!eng) return
    const pos = at ? new Vec2(at.x, at.y) : undefined
    const lower = file.name.toLowerCase()
    if (lower.endsWith('.xopp')) {
      const { snapshot, title } = await importXoppFile(file)
      createTab(snapshot, title)
    } else if (lower.endsWith('.rnote')) {
      const { snapshot } = await openRnoteFile(file)
      createTab(snapshot, file.name.replace(/\.rnote$/, ''))
    } else if (lower.endsWith('.txt')) {
      await importTextFile(eng, file, pos)
    } else if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
      const res = await importPdf(eng, file)
      pushToast(tt('Imported PDF ({n} pages)', { n: res.pages }))
    } else {
      const res = await importImageFile(eng, file, pos)
      if (res.kind === 'unknown') pushToast(tt('Unsupported file: {name}', { name: file.name }))
    }
  }

  async function exportImage(opts: {
    region: any
    format: 'png' | 'jpeg'
    dpi: number
    margin: number
    withBackground: boolean
    withPattern: boolean
    optimizePrinting: boolean
    pageOrder: 'horizontal-first' | 'vertical-first'
  }) {
    if (!engine.value) return
    try {
      await exportBitmap(engine.value, opts)
      pushToast(`Exported ${opts.format.toUpperCase()}`)
    } catch (e) {
      pushToast('Export failed')
      console.error(e)
    }
  }

  async function exportSvg(opts: {
    region: any
    margin: number
    withBackground: boolean
    withPattern: boolean
    optimizePrinting: boolean
    pageOrder: 'horizontal-first' | 'vertical-first'
  }) {
    if (!engine.value) return
    try {
      await exportSVG(engine.value, opts)
      pushToast('Exported SVG')
    } catch (e) {
      pushToast('SVG export failed')
      console.error(e)
    }
  }

  async function exportPdf(opts: {
    region: any
    dpi: number
    margin: number
    withBackground: boolean
    withPattern: boolean
    optimizePrinting: boolean
    pageOrder: 'horizontal-first' | 'vertical-first'
  }) {
    if (!engine.value) return
    try {
      await exportPDF(engine.value, opts)
      pushToast(tt('Exported PDF'))
    } catch (e) {
      pushToast(tt('PDF export failed'))
      console.error(e)
    }
  }

  async function exportXoppDoc() {
    if (!engine.value) return
    try {
      await exportXopp(engine.value)
      pushToast(tt('Exported Xournal++ .xopp'))
    } catch (e) {
      console.error(e)
      pushToast(tt('XOPP export failed'))
    }
  }

  function printDoc() {
    if (!engine.value) return
    try {
      printDocument(engine.value)
    } catch (e) {
      console.error(e)
      pushToast(tt('Print window blocked by the browser, please allow pop-ups'))
    }
  }

  function clearDocument() {
    engine.value?.clear(true)
    closeDialog()
    pushToast('Document cleared')
  }

  // Debug/testing hook for browser automation. Dev-only; production builds strip it.
  if (import.meta.env.DEV) {
    ;(window as any).__rnoteStore = {
      get engine() { return engine.value },
      get tabs() { return tabs.value },
      get workspaceOpen() { return workspaceOpen.value },
      get sidebarOpen() { return sidebarOpen.value },
      get focusMode() { return focusMode.value },
      get uiTick() { return uiTick.value },
      setTheme
    }
  }

  return {
    tabs,
    activeId,
    closingTabId,
    activeTab,
    engine,
    sidebarOpen,
    workspaceOpen,
    sidebarTab,
    focusMode,
    theme,
    dialog,
    contextMenu,
    toasts,
    uiTick,
    canvasReady,
    fileInput,
    general,
    createTab,
    newTab,
    selectTab,
    moveTab,
    reorderTab,
    closeTab,
    forceCloseTab,
    cancelCloseTab,
    discardAndCloseTab,
    saveAndCloseTab,
    setPen,
    pushToast,
    openDialog,
    closeDialog,
    openContextMenu,
    closeContextMenu,
    pendingImport,
    stageImport,
    cancelImport,
    confirmPdfImport,
    confirmXoppImport,
    setTheme,
    applyTheme,
    toggleSidebar,
    toggleWorkspace,
    openSettings,
    openWorkspace,
    toggleFocus,
    touchDrawingEnabled,
    toggleTouchDrawing,
    autosave,
    restoreLastSession,
    restoreLastSessionAsync,
    bump,
    saveDocument,
    openDocument,
    importFiles,
    importFileAt,
    exportImage,
    exportSvg,
    exportPdf,
    exportXoppDoc,
    printDoc,
    clearDocument
  }
})
