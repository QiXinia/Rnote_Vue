import type { Stroke } from './stroke'
import { BrushStroke } from './brushstroke'
import { ShapeStroke } from './shapestroke'
import { TextStroke } from './textstroke'
import { BitmapImageStroke, VectorImageStroke } from './imagestroke'

export function hydrateStroke(json: any): Stroke | null {
  if (!json || !json.kind) return null
  switch (json.kind) {
    case 'brush':
      return BrushStroke.fromJSON(json)
    case 'shape':
      return ShapeStroke.fromJSON(json)
    case 'text':
      return TextStroke.fromJSON(json)
    case 'bitmap':
      return BitmapImageStroke.fromJSON(json)
    case 'vector':
      return VectorImageStroke.fromJSON(json)
    default:
      console.warn('unknown stroke kind', json.kind)
      return null
  }
}

export * from './stroke'
export * from './brushstroke'
export * from './shapestroke'
export * from './textstroke'
export * from './imagestroke'
