/// <reference types="vite/client" />

declare module 'culori' {
  export interface CuloriColor {
    mode: string
    r?: number
    g?: number
    b?: number
    h?: number
    s?: number
    v?: number
    alpha?: number
  }
  export function converter(mode: string): (color: CuloriColor) => CuloriColor
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
