// Port of rnote-engine Engine: owns the document, camera, stroke store, pen
// configurations, history, clipboard and global editor settings.

import { Vec2, Aabb } from '../compose/geometry'
import { Document } from './document/document'
import { Camera } from './camera/camera'
import { StrokeStore } from './store/store'
import { History } from './history/history'
import { PensConfig, PenStyle, PenMode } from './pens/pensconfig'
import { hydrateStroke, type Stroke } from './strokes/index'
import { nextStrokeId } from './strokes/next-id'
import { Color } from '../compose/style/color'

export interface EngineSettings {
  snapPositions: boolean
  respectBordersWhenPasting: boolean
  penSounds: boolean
  touchDrawing: boolean
  blockPinchZoom: boolean
  showGridCursor: boolean
}

export interface EngineSnapshot {
  version: { major: number; minor: number; patch: number }
  document: any
  camera: any
  pens_config: any
  store: { strokes: any[]; selected: number[]; groups: Record<string, number[]> }
  settings: Partial<EngineSettings>
}

export class Engine {
  document = new Document()
  camera = new Camera()
  // One-shot request: fit the document/content into the viewport the first
  // time it is bound after being created/imported without its own camera
  // (consumed by the canvas controller once the real viewport size is known).
  // Desktop .rnote files carry their own camera and are restored verbatim, so
  // this stays null for them.
  pendingFit: 'page' | 'content' | null = null
  store = new StrokeStore()
  pensConfig = new PensConfig()
  history = new History()
  settings: EngineSettings = {
    snapPositions: true,
    respectBordersWhenPasting: true,
    penSounds: false,
    touchDrawing: true,
    blockPinchZoom: false,
    showGridCursor: false
  }

  currentPen: PenStyle = PenStyle.Brush
  penMode: PenMode = PenMode.Pen
  clipboard: any[] = []
  clipboardFormat: 'rnote-vue' | null = null

  // document identity / unsaved state
  fileName = 'New Document'
  filePath: string | null = null
  dirty = false
  savedSnapshotKey = ''

  onChange: (() => void) | null = null
  onRequestRender: (() => void) | null = null
  onSnapshotLoaded: (() => void) | null = null
  onContentMutated: (() => void) | null = null
  onToast: ((msg: string) => void) | null = null

  constructor() {
    this.history.onChange = () => this.notify()
  }

  notify() {
    this.dirty = true
    this.onChange?.()
    this.onContentMutated?.()
    this.onRequestRender?.()
  }

  requestRender() {
    this.onRequestRender?.()
  }

  toast(msg: string) {
    this.onToast?.(msg)
  }

  // ---- pen selection ----
  setPen(pen: PenStyle) {
    this.currentPen = pen
    this.penMode = PenMode.Pen
    this.notify()
  }

  activePenStyle(): PenStyle {
    if (this.penMode === PenMode.Eraser) return this.pensConfig.eraserModeStyle
    return this.currentPen
  }

  toggleEraserMode() {
    this.penMode = this.penMode === PenMode.Eraser ? PenMode.Pen : PenMode.Eraser
    this.notify()
  }

  // ---- color / width convenience used by the UI ----
  activeColor(): Color {
    switch (this.activePenStyle()) {
      case PenStyle.Brush:
        return this.pensConfig.brush.color()
      case PenStyle.Shaper:
        return this.pensConfig.shaper.color()
      case PenStyle.Typewriter:
        return this.pensConfig.typewriter.color
      default:
        return Color.BLACK
    }
  }
  setActiveColor(c: Color) {
    switch (this.activePenStyle()) {
      case PenStyle.Brush:
        this.pensConfig.brush.setColor(c)
        break
      case PenStyle.Shaper:
        this.pensConfig.shaper.setColor(c)
        break
      case PenStyle.Typewriter:
        this.pensConfig.typewriter.color = c
        break
    }
    this.notify()
  }
  activeWidth(): number {
    switch (this.activePenStyle()) {
      case PenStyle.Brush:
        return this.pensConfig.brush.width()
      case PenStyle.Shaper:
        return this.pensConfig.shaper.width()
      case PenStyle.Eraser:
        return this.pensConfig.eraser.width
      default:
        return 2
    }
  }
  setActiveWidth(w: number) {
    switch (this.activePenStyle()) {
      case PenStyle.Brush:
        this.pensConfig.brush.setWidth(w)
        break
      case PenStyle.Shaper:
        this.pensConfig.shaper.setWidth(w)
        break
      case PenStyle.Eraser:
        this.pensConfig.eraser.width = w
        break
    }
    this.notify()
  }

  // ---- stroke commit helpers (record history) ----
  commitAddStroke(stroke: Stroke, select = false) {
    const id = stroke.id
    this.store.addStroke(stroke, select)
    this.history.push({
      label: 'Draw Stroke',
      undo: () => this.store.remove(id),
      redo: () => this.store.addStroke(stroke, select)
    })
    this.notify()
  }

  commitAddStrokes(strokes: Stroke[]) {
    if (!strokes.length) return
    const ids = strokes.map((s) => s.id)
    this.store.addStrokes(strokes)
    this.history.push({
      label: 'Add Strokes',
      undo: () => this.store.removeStrokes(ids),
      redo: () => this.store.addStrokes(strokes)
    })
    this.notify()
  }

  recordTransform(ids: number[], before: Map<number, any>, label = 'Transform Strokes', coalesceKey?: string) {
    const after = new Map<number, any>()
    for (const id of ids) {
      const s = this.store.get(id)
      if (s) after.set(id, s.toJSON())
    }
    const hydrate = (json: any) => hydrateStroke(json)
    this.history.push({
      label,
      coalesceKey,
      undo: () => this.restoreStrokeData(before, hydrate),
      redo: () => this.restoreStrokeData(after, hydrate)
    })
  }

  private restoreStrokeData(data: Map<number, any>, hydrate: (j: any) => Stroke | null) {
    for (const [id, json] of data) {
      const existing = this.store.get(id)
      const restored = hydrate(json)
      if (existing && restored) {
        // replace in place preserving map key
        this.store.strokes.set(id, restored)
      }
    }
    this.store.bump()
    this.requestRender()
  }

  removeSelected(record = true) {
    const ids = [...this.store.selected]
    if (!ids.length) return
    const removed = ids.map((id) => this.store.get(id)!.toJSON())
    this.store.removeStrokes(ids)
    if (record) {
      this.history.push({
        label: 'Delete Selection',
        undo: () => {
          for (const j of removed) {
            const s = hydrateStroke(j)
            if (s) this.store.addStroke(s)
          }
        },
        redo: () => this.store.removeStrokes(ids)
      })
    }
    this.notify()
  }

  duplicateSelected(): Stroke[] {
    const ids = [...this.store.selected]
    if (!ids.length) return []
    const copies = this.store.duplicateStrokes(ids, new Vec2(24, 24))
    this.store.setSelection(copies.map((c) => c.id))
    this.history.push({
      label: 'Duplicate Selection',
      undo: () => this.store.removeStrokes(copies.map((c) => c.id)),
      redo: () => this.store.addStrokes(copies)
    })
    this.notify()
    return copies
  }

  invertSelectedColors() {
    const selected = this.store.selectedStrokes()
    if (!selected.length) return
    const before = new Map(selected.map((s) => [s.id, s.toJSON()]))
    for (const s of selected) s.invertColors?.()
    const after = new Map(selected.map((s) => [s.id, s.toJSON()]))
    this.history.push({
      label: 'Invert Colors',
      undo: () => this.restoreStrokeData(before, hydrateStroke),
      redo: () => this.restoreStrokeData(after, hydrateStroke)
    })
    this.notify()
  }

  selectAll() {
    this.store.selectAll()
    this.requestRender()
  }
  deselectAll() {
    this.store.deselectAll()
    this.requestRender()
  }

  // ---- clipboard ----
  copySelection(cut = false) {
    const selected = this.store.selectedStrokes()
    if (!selected.length) return
    this.clipboard = selected.map((s) => s.toJSON())
    this.clipboardFormat = 'rnote-vue'
    if (cut) this.removeSelected()
  }

  paste(atDoc?: Vec2) {
    if (!this.clipboard.length) return
    const copies = this.clipboard
      .map((j) => hydrateStroke(j))
      .filter(Boolean) as Stroke[]
    // fresh ids so pasting never overwrites the live source strokes
    for (const s of copies) s.id = nextStrokeId()
    // compute offset: center to given point or nudge
    let delta = new Vec2(24, 24)
    if (atDoc) {
      let b: Aabb | null = null
      for (const s of copies) b = b ? b.union(s.bounds()) : s.bounds()
      if (b) delta = atDoc.sub(b.center())
    }
    for (const s of copies) s.translate(delta)
    this.store.addStrokes(copies)
    this.store.setSelection(copies.map((s) => s.id))
    this.history.push({
      label: 'Paste Clipboard',
      undo: () => this.store.removeStrokes(copies.map((s) => s.id)),
      redo: () => this.store.addStrokes(copies)
    })
    this.notify()
  }

  // ---- document ops ----
  clear(record = true) {
    const snap = this.snapshot()
    this.store.clear()
    if (record) {
      this.history.push({
        label: 'Clear Document',
        undo: () => this.loadSnapshot(snap, false),
        redo: () => this.store.clear()
      })
    }
    this.notify()
  }

  newDocument() {
    this.document = new Document()
    this.camera = new Camera()
    this.store.clear()
    this.history.clear()
    this.fileName = 'New Document'
    this.filePath = null
    this.dirty = false
    this.notify()
  }

  // ---- snapshots / persistence ----
  snapshot(): EngineSnapshot {
    return {
      version: { major: 0, minor: 15, patch: 0 },
      document: this.document.toJSON(),
      camera: this.camera.toJSON(),
      pens_config: this.pensConfig.toJSON(),
      store: this.store.snapshot(),
      settings: { ...this.settings }
    }
  }

  loadSnapshot(snap: EngineSnapshot | any, resetHistory = true) {
    if (snap.document) this.document = Document.fromJSON(snap.document)
    if (snap.camera) this.camera = Camera.fromJSON(snap.camera)
    if (snap.pens_config || snap.pensConfig) this.pensConfig = PensConfig.fromJSON(snap.pens_config ?? snap.pensConfig)
    if (snap.store) this.store.restore(snap.store, hydrateStroke)
    else if (Array.isArray(snap.strokes)) this.store.restore({ strokes: snap.strokes, selected: [], groups: {} }, hydrateStroke)
    if (snap.settings) Object.assign(this.settings, snap.settings)
    if (resetHistory) this.history.clear()
    this.dirty = false
    this.savedSnapshotKey = JSON.stringify(this.snapshot().store)
    this.notify()
    this.onSnapshotLoaded?.()
  }

  markSaved(name: string, path: string | null = null) {
    this.fileName = name
    this.filePath = path
    this.dirty = false
    this.savedSnapshotKey = JSON.stringify(this.snapshot().store)
    this.onChange?.()
  }

  contentBounds(): Aabb | null {
    return this.store.boundsAll()
  }
}
