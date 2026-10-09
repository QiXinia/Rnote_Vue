// Command-pattern undo/redo stack (replaces rnote's render-task history with
// an explicit inverse-action model suitable for the web).

export interface HistoryCommand {
  label: string
  undo: () => void
  redo: () => void
  // optional coalescing key so e.g. dragging a selection is one undo step
  coalesceKey?: string
}

export class History {
  private stack: HistoryCommand[] = []
  private pointer = 0
  private limit = 200
  onChange: (() => void) | null = null

  get canUndo(): boolean {
    return this.pointer > 0
  }
  get canRedo(): boolean {
    return this.pointer < this.stack.length
  }

  push(cmd: HistoryCommand) {
    // drop redo branch
    if (this.pointer < this.stack.length) this.stack.length = this.pointer
    // coalesce consecutive commands with the same key
    const last = this.stack[this.stack.length - 1]
    if (cmd.coalesceKey && last && last.coalesceKey === cmd.coalesceKey) {
      const prevRedo = last.redo
      const newRedo = cmd.redo
      last.redo = () => {
        prevRedo()
        newRedo()
      }
      // undo for the coalesced command: the new command's undo should run
      // before the previous undo; rebuild chain
      const prevUndo = last.undo
      const newUndo = cmd.undo
      last.undo = () => {
        newUndo()
        prevUndo()
      }
    } else {
      this.stack.push(cmd)
      this.pointer++
    }
    if (this.stack.length > this.limit) {
      this.stack.shift()
      this.pointer--
    }
    this.changed()
  }

  undo() {
    if (!this.canUndo) return
    this.pointer--
    this.stack[this.pointer].undo()
    this.changed()
  }

  redo() {
    if (!this.canRedo) return
    this.stack[this.pointer].redo()
    this.pointer++
    this.changed()
  }

  clear() {
    this.stack = []
    this.pointer = 0
    this.changed()
  }

  // call when a coalescing gesture ends so the next command starts fresh
  breakCoalesce() {
    const last = this.stack[this.stack.length - 1]
    if (last) last.coalesceKey = undefined
  }

  labels(): { undo: string | null; redo: string | null } {
    return {
      undo: this.pointer > 0 ? this.stack[this.pointer - 1].label : null,
      redo: this.pointer < this.stack.length ? this.stack[this.pointer].label : null
    }
  }

  private changed() {
    this.onChange?.()
  }
}
