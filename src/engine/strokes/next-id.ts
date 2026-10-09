// Global stroke id allocator. Every stroke (brush / shape / text / image) must
// have a process-wide unique id because the store is a Map keyed by id; per-type
// counters would collide across types and silently overwrite strokes.

let counter = 0

export function nextStrokeId(): number {
  counter += 1
  return counter
}

// Re-seed the allocator above all ids already present (used after hydrating a
// snapshot so newly created strokes never collide with loaded ones).
export function seedStrokeIds(maxId: number): void {
  if (maxId > counter) counter = maxId
}
