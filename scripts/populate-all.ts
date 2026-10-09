// One-shot: rebuild the full coverage document (all stroke kinds + images).
import { populateTestStrokes } from './make-test-strokes'
import { populateImages } from './make-test-images'
import type { Engine } from '../src/engine/engine'

export async function populateAll(engine: Engine): Promise<number> {
  populateTestStrokes(engine)
  await populateImages(engine)
  return engine.snapshot().store.strokes.length
}
