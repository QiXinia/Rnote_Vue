// CanvasController wires DOM pointer / wheel / keyboard events to the active
// Engine, PenHolder and Camera, and runs the render loop. It also owns the
// typewriter contenteditable overlay state.

import { reactive } from 'vue'
import { Vec2 } from '../compose/geometry'
import { Layout } from '../engine/document/layout'
import { Renderer } from '../engine/render/renderer'
import { gestureState } from '../engine/render/gestureState'
import { setImageFrameNotifier } from '../engine/strokes/imagestroke'
import { PenHolder } from '../engine/pens/penholder'
import { PenStyle, PenMode, ToolsStyle } from '../engine/pens/pensconfig'
import type { PenContext, PointerInfo, Pen } from '../engine/pens/pen'
import { TextStroke, TextStyle } from '../engine/strokes/textstroke'
import { hydrateStroke } from '../engine/strokes/index'
import type { Stroke } from '../engine/strokes/stroke'
import type { useAppStore } from '../stores/app'

export interface TextEditState {
  active: boolean
  screenX: number
  screenY: number
  width: number
  zoom: number
  fontSize: number
  fontFamily: string
  color: string
  weight: number
  italic: boolean
  underline: boolean
  strike: boolean
  align: string
  html: string
  strokeId: number | null
  docTranslation: Vec2
}

export class CanvasController {
  canvas: HTMLCanvasElement
  store: ReturnType<typeof useAppStore>
  renderer: Renderer | null = null
  pens = new PenHolder()
  rafId = 0
  needsFrame = true
  holdFrames = 0
  dpr = 1

  private pointers = new Map<number, { x: number; y: number; type: string }>()
  private panGesture: { id: number; lastX: number; lastY: number } | null = null
  private pinch: { dist: number; zoom: number; cx: number; cy: number } | null = null
  private zoomSettleTimer: ReturnType<typeof setTimeout> | null = null
  private wheelPanTimer: ReturnType<typeof setTimeout> | null = null
  private spaceDown = false
  private penEraserOverride = false
  private lastPointer: PointerInfo | null = null
  private dblClickPos: Vec2 | null = null
  private textResize = false
  private textResizeStartX = 0
  private textResizeStartW = 600

  textEdit = reactive<TextEditState>({
    active: false,
    screenX: 0,
    screenY: 0,
    width: 600,
    zoom: 1,
    fontSize: 32,
    fontFamily: 'serif',
    color: '#000',
    weight: 500,
    italic: false,
    underline: false,
    strike: false,
    align: 'left',
    html: '',
    strokeId: null,
    docTranslation: new Vec2()
  })

  private penContext: PenContext

  constructor(canvas: HTMLCanvasElement, store: ReturnType<typeof useAppStore>) {
    this.canvas = canvas
    this.store = store
    this.penContext = {
      engine: null as any,
      render: () => this.requestFrame(),
      beginTextEdit: (t, id) => this.beginTextEdit(t, id),
      panByScreen: (d) => this.engine()?.camera.panBy(d),
      zoomAt: (f, focal) => this.engine()?.camera.zoomBy(f, focal),
      screenSize: new Vec2(window.innerWidth, window.innerHeight),
      beginMarquee: () => this.renderer?.beginMarquee(),
      beginMoveSel: () => this.renderer?.beginMove(),
      beginTransformSel: () => this.renderer?.beginTransform(),
      moveSelect: (dx, dy) => this.renderer?.moveSelect(dx, dy),
      endSelect: () => {
        this.renderer?.endSelect()
        this.requestFrame()
      },
      invalidateTiles: () => this.renderer?.invalidateTiles(),
      hitTestScreen: (sx, sy) => {
        const eng = this.engine()
        if (!eng) return []
        const doc = eng.camera.screenToDoc(new Vec2(sx, sy))
        return eng.store.hitTestPoint(doc, 0, eng.camera.zoom, true)
      }
    }
  }

  engine() {
    return this.store.engine
  }

  attach() {
    const c = this.canvas
    c.addEventListener('pointerdown', this.onPointerDown)
    c.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
    c.addEventListener('pointerleave', this.onPointerLeave)
    c.addEventListener('wheel', this.onWheel, { passive: false })
    c.addEventListener('dblclick', this.onDblClick)
    c.addEventListener('contextmenu', this.onContextMenu)
    c.addEventListener('dragover', this.onDragOver)
    c.addEventListener('drop', this.onDrop)
    window.addEventListener('paste', this.onPaste)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('resize', this.onResize)
    this.ensureRenderer()
    this.onResize()
    const loop = () => {
      // On-demand rendering: redraw while something explicitly requested a
      // frame, then keep drawing a few extra frames so async/coalesced changes
      // (image decode, chained store updates) are not missed. When the scene is
      // idle we stop touching the canvas entirely.
      if (this.needsFrame) {
        this.render()
        this.holdFrames = 5
      } else if (this.holdFrames > 0) {
        this.render()
        this.holdFrames--
      }
      this.rafId = requestAnimationFrame(loop)
    }
    this.rafId = requestAnimationFrame(loop)
  }

  detach() {
    const c = this.canvas
    c.removeEventListener('pointerdown', this.onPointerDown)
    c.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerUp)
    c.removeEventListener('pointerleave', this.onPointerLeave)
    c.removeEventListener('wheel', this.onWheel)
    c.removeEventListener('dblclick', this.onDblClick)
    c.removeEventListener('contextmenu', this.onContextMenu)
    c.removeEventListener('dragover', this.onDragOver)
    c.removeEventListener('drop', this.onDrop)
    window.removeEventListener('paste', this.onPaste)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('resize', this.onResize)
    cancelAnimationFrame(this.rafId)
    setImageFrameNotifier(null)
  }

  ensureRenderer() {
    const eng = this.engine()
    if (!eng) return
    if (!this.renderer) {
      this.renderer = new Renderer(this.canvas, eng)
      ;(window as any).__renderer = this.renderer
      eng.onRequestRender = () => this.requestFrame()
      this.renderer.drawDocOverlay = (ctx) => {
        const pen = this.activePen()
        pen?.drawOverlay?.(ctx, this.penContext)
      }
    } else {
      this.renderer.bindEngine(eng)
      eng.onRequestRender = () => this.requestFrame()
    }
    this.renderer.dark = document.documentElement.dataset.theme === 'dark'
    setImageFrameNotifier(() => this.requestFrame())
    eng.onSnapshotLoaded = () => {
      this.renderer?.invalidateTiles()
      this.scheduleWarmUp()
    }
    eng.onContentMutated = () => this.renderer?.invalidateTiles()
    this.scheduleWarmUp()
  }

  // ---- background warm-up of stroke geometry/sprites ----
  private warmQueue: Stroke[] = []
  private warmToken = 0
  scheduleWarmUp() {
    const eng = this.engine()
    if (!eng) return
    const token = ++this.warmToken
    const top = eng.camera.visibleDocBounds().min.y
    // Only pre-warm strokes around the current viewport (the desktop does this
    // on background threads; on the Web main thread warming all strokes would
    // steal frame time after opening). Strokes scrolled into view later are
    // rasterised by the renderer's per-frame budget.
    const view = eng.camera.visibleDocBounds()
    const margin = Math.max(view.width(), view.height()) * 1.5
    const region = view.extend_by(margin)
    const queue = eng
      .store.ordered()
      .filter((s) => typeof (s as any).warm === 'function' && region.intersects(s.bounds()))
    // Prioritise the current viewport and the area below it (the normal reading
    // / scrolling direction), so an immediate scroll mostly hits warm sprites.
    queue.sort((a, b) => {
      const da = Math.max(0, a.bounds().min.y - top)
      const db = Math.max(0, b.bounds().min.y - top)
      return da - db
    })
    this.warmQueue = queue
    const step = () => {
      if (token !== this.warmToken) return
      const e = this.engine()
      if (!e) return
      // First priority: pre-flatten tiles over the viewport + read-ahead.
      // Building a tile also rasterises the strokes it contains.
      if (this.renderer && !this.renderer.warmVisibleTiles(8)) {
        requestAnimationFrame(step)
        return
      }
      // Then warm remaining stroke sprites in the wider region (direct-draw /
      // areas beyond the tile read-ahead), with a small per-frame budget.
      const eff = Math.max(this.dpr * e.camera.zoom, 1)
      const deadline = performance.now() + 3
      while (this.warmQueue.length && performance.now() < deadline) {
        const s = this.warmQueue.shift()!
        ;(s as any).warm?.(eff)
      }
      if (this.warmQueue.length) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  // called when the active tab / engine changes
  rebindEngine() {
    this.cancelTextEdit(true)
    this.ensureRenderer()
    this.onResize()
    const eng = this.engine()
    if (eng?.pendingFit) {
      // Fit once the real viewport size is known: prefer the drawn content,
      // otherwise the page/document bounds.
      const content = eng.contentBounds()
      let b = content && !content.zero() ? content : null
      if (!b) {
        b = eng.document.layout === Layout.FixedSize
          ? eng.document.fixedBounds()
          : eng.document.pageBounds(0)
      }
      if (b && !b.zero()) eng.camera.fitBounds(b)
      eng.pendingFit = null
    }
    this.requestFrame()
  }

  requestFrame() {
    this.needsFrame = true
  }

  render() {
    const eng = this.engine()
    if (!eng || !this.renderer) return
    this.penContext.engine = eng
    this.penContext.screenSize = eng.camera.viewportSize.clone()
    if (this.renderer) this.renderer.bindEngine(eng)
    this.renderer.dark = document.documentElement.dataset.theme === 'dark'
    this.renderer.render()
    this.updateTextEditPosition()
    this.updateCursor()
    this.needsFrame = false
  }

  onResize = () => {
    const parent = this.canvas.parentElement
    if (!parent) return
    const w = parent.clientWidth
    const h = parent.clientHeight
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    this.renderer?.resize(w, h, this.dpr)
    this.engine()?.camera.setViewport(new Vec2(w, h))
    this.requestFrame()
  }

  // ---- pointer helpers ----
  private toPointerInfo(e: PointerEvent): PointerInfo {
    const rect = this.canvas.getBoundingClientRect()
    const screen = new Vec2(e.clientX - rect.left, e.clientY - rect.top)
    const eng = this.engine()!
    const isPen = e.pointerType === 'pen'
    return {
      docPos: eng.camera.screenToDoc(screen),
      screenPos: screen,
      // A hovering stylus reports pressure 0 with no buttons; treat as neutral
      // so hover never produces a hairline width.
      pressure: isPen && e.pressure > 0 ? e.pressure : !isPen ? 0.5 : 0.5,
      pointerType: isPen ? 'pen' : e.pointerType === 'touch' ? 'touch' : 'mouse',
      buttons: e.buttons,
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      meta: e.metaKey,
      isPrimary: e.isPrimary,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      twist: e.twist,
      tangentialPressure: e.tangentialPressure,
      eraser: isPen && (e.button === 5 || (e.buttons & 32) !== 0)
    }
  }

  // Build PointerInfo for a (possibly coalesced) pointer event, reusing the
  // canvas rect of the owning canvas.
  private infoFromEvent(eng: NonNullable<ReturnType<CanvasController['engine']>>, e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect()
    const screen = new Vec2(e.clientX - rect.left, e.clientY - rect.top)
    const isPen = e.pointerType === 'pen'
    const info: PointerInfo = {
      docPos: eng.camera.screenToDoc(screen),
      screenPos: screen,
      pressure: isPen && e.pressure > 0 ? e.pressure : 0.5,
      pointerType: isPen ? 'pen' : e.pointerType === 'touch' ? 'touch' : 'mouse',
      buttons: e.buttons,
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      meta: e.metaKey,
      isPrimary: e.isPrimary,
      tiltX: e.tiltX,
      tiltY: e.tiltY,
      twist: e.twist,
      tangentialPressure: e.tangentialPressure,
      eraser: isPen && (e.button === 5 || (e.buttons & 32) !== 0)
    }
    return info
  }

  private activePen(): Pen | null {
    const eng = this.engine()
    if (!eng) return null
    // stylus eraser button override
    if (this.penEraserOverride) return this.pens.eraser as unknown as Pen
    return this.pens.active(eng)
  }

  private isCameraGesture(e: PointerEvent, info: PointerInfo): boolean {
    if (this.spaceDown) return true
    if (e.button === 1) return true // middle mouse
    if (e.button === 2) return true // right button pans
    if (info.alt) return true // Alt+drag = move view
    if (info.pointerType === 'touch' && !this.engine()?.settings.touchDrawing) return true
    if (info.pointerType === 'touch' && this.pointers.size >= 1 && e.isPrimary === false) return true
    return false
  }

  onPointerDown = (e: PointerEvent) => {
    if (this.textEdit.active && !(e.target as HTMLElement).classList.contains('text-editor')) {
      this.commitTextEdit()
    }
    this.canvas.setPointerCapture?.(e.pointerId)
    this.canvas.focus?.()
    const info = this.toPointerInfo(e)
    this.pointers.set(e.pointerId, { x: info.screenPos.x, y: info.screenPos.y, type: e.pointerType })

    // stylus eraser button
    if (e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32))) {
      this.penEraserOverride = true
    }

    // pinch / two-touch handling
    const touchPts = [...this.pointers.values()].filter((p) => p.type === 'touch')
    if (touchPts.length === 2) {
      const [a, b] = touchPts
      this.pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: this.engine()!.camera.zoom,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2
      }
      this.activePen()?.cancel?.(this.penContext)
      return
    }

    if (this.isCameraGesture(e, info)) {
      this.panGesture = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY }
      this.canvas.style.cursor = 'grabbing'
      // Snapshot the current high-quality frame; subsequent move frames blit it.
      this.renderer?.beginPan()
      return
    }

    // offset-camera tool handled by pen; prevent pen drawing for non-primary
    this.lastPointer = info
    this.activePen()?.onDown(this.penContext, info)
  }

  onPointerMove = (e: PointerEvent) => {
    const info = this.toPointerInfo(e)
    const existing = this.pointers.get(e.pointerId)
    if (existing) {
      existing.x = info.screenPos.x
      existing.y = info.screenPos.y
    }
    this.lastPointer = info

    // pinch zoom
    const touchPts = [...this.pointers.values()].filter((p) => p.type === 'touch')
    if (touchPts.length === 2 && this.pinch && !this.engine()?.settings.blockPinchZoom) {
      const [a, b] = touchPts
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const eng = this.engine()!
      eng.camera.setZoom(this.pinch.zoom * (dist / this.pinch.dist), new Vec2(cx, cy))
      // pan by centre movement
      eng.camera.panBy(new Vec2(cx - this.pinch.cx, cy - this.pinch.cy))
      this.pinch.cx = cx
      this.pinch.cy = cy
      this.markZooming()
      this.requestFrame()
      return
    } else if (touchPts.length === 2 && this.pinch) {
      // pinch zoom blocked: still pan
      const [a, b] = touchPts
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      this.engine()?.camera.panBy(new Vec2(cx - this.pinch.cx, cy - this.pinch.cy))
      this.pinch.cx = cx
      this.pinch.cy = cy
      this.requestFrame()
      return
    }

    if (this.panGesture && this.panGesture.id === e.pointerId) {
      const dx = e.clientX - this.panGesture.lastX
      const dy = e.clientY - this.panGesture.lastY
      this.panGesture.lastX = e.clientX
      this.panGesture.lastY = e.clientY
      this.renderer?.offsetPan(dx, dy)
      this.engine()?.camera.panBy(new Vec2(dx, dy))
      this.requestFrame()
      return
    }

    // Drawing path: replay all coalesced events so high-frequency stylus input
    // keeps every pressure sample instead of only the last event per frame.
    const eng = this.engine()
    if (!eng) return
    let coalesced: PointerEvent[] = []
    if (typeof e.getCoalescedEvents === 'function') {
      try {
        coalesced = e.getCoalescedEvents()
      } catch {
        coalesced = []
      }
    }
    const pen = this.activePen()
    if (!pen) return
    if (coalesced.length > 1) {
      for (const ce of coalesced) {
        if (ce.pointerId !== e.pointerId) continue
        const ci = this.infoFromEvent(eng, ce)
        this.lastPointer = ci
        pen.onMove(this.penContext, ci)
      }
    } else {
      pen.onMove(this.penContext, info)
    }
    this.requestFrame()
  }

  onPointerUp = (e: PointerEvent) => {
    const info = this.toPointerInfo(e)
    const wasPanning = this.panGesture?.id === e.pointerId
    if (wasPanning) {
      this.panGesture = null
      this.canvas.style.cursor = ''
      // Stop blitting and run one full-quality pass at the final camera position.
      this.renderer?.endPan()
      this.requestFrame()
    }
    if (this.pointers.has(e.pointerId)) {
      this.activePen()?.onUp(this.penContext, info)
    }
    this.pointers.delete(e.pointerId)
    const touchPts = [...this.pointers.values()].filter((p) => p.type === 'touch')
    if (touchPts.length < 2) this.pinch = null
    if (e.pointerType === 'pen' && this.penEraserOverride) this.penEraserOverride = false
  }

  onPointerLeave = () => {
    this.requestFrame()
  }

  onDblClick = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect()
    const screen = new Vec2(e.clientX - rect.left, e.clientY - rect.top)
    const doc = this.engine()!.camera.screenToDoc(screen)
    this.dblClickPos = doc
    const info: PointerInfo = {
      docPos: doc,
      screenPos: screen,
      pressure: 0.5,
      pointerType: 'mouse',
      buttons: 0,
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      meta: e.metaKey,
      isPrimary: true
    }
    this.activePen()?.onDouble?.(this.penContext, info)
  }

  onContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    const p = this.docPosFromClient(e.clientX, e.clientY)
    this.store.openContextMenu(e.clientX, e.clientY, p.x, p.y)
  }

  private docPosFromClient(clientX: number, clientY: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect()
    return this.engine()!.camera.screenToDoc(new Vec2(clientX - rect.left, clientY - rect.top))
  }

  onDragOver = (e: DragEvent) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
  }

  onDrop = async (e: DragEvent) => {
    const files = e.dataTransfer?.files
    if (!files?.length) return
    e.preventDefault()
    const pos = this.docPosFromClient(e.clientX, e.clientY)
    for (const file of Array.from(files)) {
      await this.store.importFileAt(file, { x: pos.x, y: pos.y })
    }
    this.requestFrame()
  }

  onPaste = async (e: ClipboardEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
    const files = e.clipboardData?.files
    if (files?.length) {
      e.preventDefault()
      const eng = this.engine()
      const pos = eng?.camera.screenToDoc(eng.camera.viewportSize.mul(0.5))
      for (const file of Array.from(files)) {
        await this.store.importFileAt(file, pos ? { x: pos.x, y: pos.y } : undefined)
      }
      this.requestFrame()
      return
    }
    const text = e.clipboardData?.getData('text/plain')
    if (text) {
      e.preventDefault()
      const eng = this.engine()
      const pos = eng?.camera.screenToDoc(eng.camera.viewportSize.mul(0.5))
      await this.store.importFileAt(new File([text], 'pasted-text.txt', { type: 'text/plain' }), pos ? { x: pos.x, y: pos.y } : undefined)
      this.requestFrame()
    }
  }

  private markZooming() {
    gestureState.zooming = true
    if (this.zoomSettleTimer) clearTimeout(this.zoomSettleTimer)
    this.zoomSettleTimer = setTimeout(() => {
      // Gesture settled: release the freeze and request a sharp re-raster.
      gestureState.zooming = false
      this.zoomSettleTimer = null
      this.requestFrame()
    }, 130)
  }

  onWheel = (e: WheelEvent) => {
    const eng = this.engine()
    if (!eng) return
    e.preventDefault()
    const rect = this.canvas.getBoundingClientRect()
    const focal = new Vec2(e.clientX - rect.left, e.clientY - rect.top)
    if (e.ctrlKey || e.metaKey) {
      // Zooming needs the full-quality vector pass, not the panned bitmap.
      if (this.wheelPanTimer) { clearTimeout(this.wheelPanTimer); this.wheelPanTimer = null }
      this.renderer?.endPan()
      const factor = Math.exp(-e.deltaY * 0.0015)
      eng.camera.zoomBy(factor, focal)
      this.markZooming()
      this.requestFrame()
      return
    }
    // pan (shift = horizontal): blit the cached frame instead of a full redraw.
    const dx = e.shiftKey ? e.deltaY : e.deltaX
    const dy = e.shiftKey ? 0 : e.deltaY
    if (!this.renderer?.isPanning) this.renderer?.beginPan()
    this.renderer?.offsetPan(-dx, -dy)
    eng.camera.panBy(new Vec2(-dx, -dy))
    if (this.wheelPanTimer) clearTimeout(this.wheelPanTimer)
    this.wheelPanTimer = setTimeout(() => {
      // Scrolling settled: run one full-quality pass at the final position.
      this.wheelPanTimer = null
      this.renderer?.endPan()
      this.requestFrame()
    }, 120)
    this.requestFrame()
  }

  private updateCursor() {
    const eng = this.engine()
    if (!eng || this.panGesture) return
    if (this.spaceDown) {
      this.canvas.style.cursor = this.pointers.size ? 'grabbing' : 'grab'
      return
    }
    if (this.lastPointer) {
      const c = this.activePen()?.cursor?.(this.penContext, this.lastPointer)
      if (c) this.canvas.style.cursor = c
    }
  }

  // ---- keyboard ----
  onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable
    if (typing) {
      // allow Escape to leave text editing
      if (e.key === 'Escape' && target.isContentEditable) {
        this.commitTextEdit()
        e.preventDefault()
      }
      return
    }
    const eng = this.engine()
    if (!eng) return
    const ctrl = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()

    if (e.code === 'Space') {
      this.spaceDown = true
      e.preventDefault()
      return
    }

    // pen switching
    if (ctrl && !e.shiftKey && ['1', '2', '3', '4', '5', '6'].includes(key)) {
      const pens = [PenStyle.Brush, PenStyle.Shaper, PenStyle.Typewriter, PenStyle.Eraser, PenStyle.Selector, PenStyle.Tools]
      eng.setPen(pens[parseInt(key) - 1])
      e.preventDefault()
      return
    }
    if (ctrl && key === 'z' && !e.shiftKey) {
      eng.history.undo()
      this.requestFrame()
      e.preventDefault()
      return
    }
    if ((ctrl && key === 'y') || (ctrl && e.shiftKey && key === 'z')) {
      eng.history.redo()
      this.requestFrame()
      e.preventDefault()
      return
    }
    if (ctrl && key === 'c') {
      eng.copySelection(false)
      e.preventDefault()
      return
    }
    if (ctrl && key === 'x') {
      eng.copySelection(true)
      e.preventDefault()
      return
    }
    if (ctrl && key === 'v') {
      if (eng.clipboard.length) {
        eng.paste()
        this.requestFrame()
        e.preventDefault()
      }
      // If the internal clipboard is empty, let the browser paste event run so
      // external images and plain text can be imported.
      return
    }
    if (ctrl && key === 'd') {
      eng.duplicateSelected()
      this.requestFrame()
      e.preventDefault()
      return
    }
    if (ctrl && key === 'a') {
      eng.selectAll()
      e.preventDefault()
      return
    }
    if (ctrl && key === 's') {
      this.store.saveDocument(e.shiftKey)
      e.preventDefault()
      return
    }
    if (ctrl && key === 'o') {
      this.store.openDocument()
      e.preventDefault()
      return
    }
    if (ctrl && e.shiftKey && key === 'i') {
      this.store.importFiles()
      e.preventDefault()
      return
    }
    if (ctrl && key === 'p') {
      this.store.printDoc()
      e.preventDefault()
      return
    }
    if (ctrl && key === 'l') {
      this.store.openDialog('confirm-clear')
      e.preventDefault()
      return
    }
    if (ctrl && key === '=' || ctrl && key === '+') {
      eng.camera.zoomIn()
      this.requestFrame()
      e.preventDefault()
      return
    }
    if (ctrl && key === '-') {
      eng.camera.zoomOut()
      this.requestFrame()
      e.preventDefault()
      return
    }
    if (ctrl && key === '0') {
      eng.camera.reset()
      this.requestFrame()
      e.preventDefault()
      return
    }
    if (ctrl && e.shiftKey && key === 'a') {
      eng.document.addPage()
      eng.notify()
      this.requestFrame()
      e.preventDefault()
      return
    }
    if (ctrl && e.shiftKey && key === 'r') {
      eng.document.removePage()
      eng.notify()
      this.requestFrame()
      e.preventDefault()
      return
    }
    if (key === 'delete' || key === 'backspace') {
      if (eng.store.selected.size) {
        eng.removeSelected()
        this.requestFrame()
        e.preventDefault()
      }
      return
    }
    if (key === 'escape') {
      if (eng.store.selected.size) eng.deselectAll()
      this.pens.cancelAll(this.penContext)
      this.requestFrame()
      return
    }
    if (key === 'f1') {
      this.store.openDialog('shortcuts')
      e.preventDefault()
      return
    }
    if (key === '/' && e.shiftKey && ctrl) {
      this.store.openDialog('shortcuts')
      e.preventDefault()
      return
    }
    // active pen gets the event (selector nudge, shaper enter/esc)
    this.activePen()?.onKeyDown?.(this.penContext, e)
  }

  onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') this.spaceDown = false
  }

  // ---- text editing ----
  beginTextEdit(translation: Vec2, existingId?: number) {
    const eng = this.engine()!
    const cfg = eng.pensConfig.typewriter
    const state = this.textEdit
    state.active = true
    state.docTranslation = translation.clone()
    state.zoom = eng.camera.zoom
    state.width = cfg.textWidth
    state.fontSize = cfg.fontSize
    state.fontFamily = cfg.family
    state.color = cfg.color.toCss()
    state.weight = cfg.weight
    state.italic = cfg.italic
    state.underline = cfg.underline
    state.strike = cfg.strike
    state.align = mapAlignOut(cfg.alignment)
    state.strokeId = existingId ?? null
    if (existingId !== undefined) {
      const s = eng.store.get(existingId)
      if (s instanceof TextStroke) {
        state.html = s.html
        state.width = s.width
        state.fontSize = s.textStyle.size
        state.fontFamily = s.textStyle.family
        state.color = s.textStyle.color.toCss()
        state.weight = s.textStyle.weight
        state.italic = s.textStyle.italic
        state.underline = s.textStyle.underline
        state.strike = s.textStyle.strike
        state.align = mapAlignOut(s.textStyle.alignment)
      }
    } else {
      state.html = ''
    }
    this.updateTextEditPosition()
    this.requestFrame()
    requestAnimationFrame(() => {
      const el = this.canvas.parentElement?.querySelector('.text-editor') as HTMLElement | null
      if (el) {
        // The contenteditable is *uncontrolled* while typing: set its markup
        // exactly once when the editor opens (editing an existing stroke
        // populates it; a fresh stroke is empty). Re-binding it on every
        // keystroke (v-html) rebuilds the DOM and moves the caret to the
        // start, which makes characters accumulate in reverse order.
        el.innerHTML = state.html
        el.focus()
        // Place the caret at the end of the (existing) text.
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
    })
  }

  // Drag the text area's right edge to change its width (and line wrapping),
  // porting the typewriter adjust_text_width gesture.
  startTextWidthResize(e: PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    this.textResize = true
    this.textResizeStartX = e.clientX
    this.textResizeStartW = this.textEdit.width
  }
  moveTextWidthResize(e: PointerEvent) {
    if (!this.textResize) return
    const dx = (e.clientX - this.textResizeStartX) / this.textEdit.zoom
    const w = Math.max(60, this.textResizeStartW + dx)
    this.textEdit.width = w
    const eng = this.engine()
    if (eng) eng.pensConfig.typewriter.textWidth = w
  }
  endTextWidthResize() {
    if (!this.textResize) return
    this.textResize = false
    const eng = this.engine()
    if (eng && this.textEdit.strokeId !== null) {
      const s = eng.store.get(this.textEdit.strokeId)
      if (s instanceof TextStroke) s.width = this.textEdit.width
    }
  }

  private updateTextEditPosition() {
    if (!this.textEdit.active) return
    const eng = this.engine()
    if (!eng) return
    const s = this.textEdit
    const screen = eng.camera.docToScreen(s.docTranslation)
    s.screenX = screen.x
    s.screenY = screen.y
    s.zoom = eng.camera.zoom
  }

  // Called by the editor on input so it can grow with content.
  syncEditorHtml(html: string) {
    this.textEdit.html = html
  }

  commitTextEdit(cancel = false) {
    const state = this.textEdit
    if (!state.active) return
    const eng = this.engine()
    state.active = false
    const el = this.canvas.parentElement?.querySelector('.text-editor') as HTMLElement | null
    if (!eng) return
    if (!cancel) {
      const html = el?.innerHTML && el.innerHTML !== '<br>' ? el.innerHTML : state.html
      const cfg = eng.pensConfig.typewriter
      if (html && html !== '<br>' && html.trim()) {
        const style = new TextStyle()
        style.family = cfg.family
        style.size = cfg.fontSize
        style.weight = cfg.weight
        style.color = cfg.color.clone()
        style.italic = cfg.italic
        style.underline = cfg.underline
        style.strike = cfg.strike
        style.alignment = cfg.alignment
        if (state.strokeId !== null) {
          const existing = eng.store.get(state.strokeId)
          if (existing instanceof TextStroke) {
            const before = existing.toJSON()
            existing.html = html
            existing.width = cfg.textWidth
            existing.textStyle = style
            const after = existing.toJSON()
            eng.history.push({
              label: 'Edit Text',
              undo: () => this.replaceStroke(before),
              redo: () => this.replaceStroke(after)
            })
            eng.notify()
          }
        } else {
          const stroke = new TextStroke(html, state.docTranslation.clone(), cfg.textWidth, style)
          eng.commitAddStroke(stroke)
        }
      }
    }
    if (el) el.innerHTML = ''
    this.requestFrame()
  }

  private replaceStroke(json: any) {
    const eng = this.engine()
    if (!eng) return
    const s = hydrateStroke(json)
    if (s) {
      eng.store.strokes.set(s.id, s)
      eng.store.bump()
      this.requestFrame()
    }
  }

  cancelTextEdit(silent = false) {
    if (this.textEdit.active) {
      this.textEdit.active = false
      if (!silent) this.requestFrame()
    }
  }
}

function mapAlignOut(a: string): string {
  return a === 'center' ? 'center' : a === 'end' ? 'right' : a === 'fill' ? 'justify' : 'left'
}
