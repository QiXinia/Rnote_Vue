// Common pen (tool) interface, port of rnote-engine pens/penbehaviour.rs.

import { Vec2 } from '../../compose/geometry'
import type { Engine } from '../engine'

export interface PointerInfo {
  docPos: Vec2
  screenPos: Vec2
  // normalised force 0..1 (0.5 for devices without pressure)
  pressure: number
  pointerType: 'mouse' | 'pen' | 'touch'
  buttons: number
  shift: boolean
  ctrl: boolean
  alt: boolean
  meta: boolean
  isPrimary: boolean
  // stylus geometry (Pointer Events); tilt in degrees, twist in degrees
  tiltX?: number
  tiltY?: number
  twist?: number
  tangentialPressure?: number
  // eraser button / tail switch held on the stylus
  eraser?: boolean
}

export interface PenContext {
  engine: Engine
  // begin editing a text stroke (typewriter)
  beginTextEdit: (translation: Vec2, existingId?: number) => void
  // request a render frame
  render: () => void
  // pan / zoom helpers (tools)
  panByScreen: (deltaScreen: Vec2) => void
  zoomAt: (factor: number, screenFocal: Vec2) => void
  // screen size for tools
  screenSize: Vec2
  // selection-interaction bitmap caches (selector pen)
  beginMarquee: () => void
  beginMoveSel: () => void
  beginTransformSel: () => void
  moveSelect: (dxDoc: number, dyDoc: number) => void
  endSelect: () => void
  // invalidate pre-flattened content tiles after a real content change
  invalidateTiles: () => void
  // hit-test a screen point (uses a real Vec2 internally)
  hitTestScreen: (sx: number, sy: number) => number[]
}

export interface Pen {
  readonly name: string
  onDown(ctx: PenContext, p: PointerInfo): void
  onMove(ctx: PenContext, p: PointerInfo): void
  onUp(ctx: PenContext, p: PointerInfo): void
  onDouble?(ctx: PenContext, p: PointerInfo): void
  onKeyDown?(ctx: PenContext, e: KeyboardEvent): void
  onKeyUp?(ctx: PenContext, e: KeyboardEvent): void
  // draw in-progress feedback in document coordinates
  drawOverlay?(docCtx: CanvasRenderingContext2D, ctx: PenContext): void
  cursor?(ctx: PenContext, p: PointerInfo): string
  cancel?(ctx: PenContext): void
}
