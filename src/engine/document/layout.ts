// Port of rnote-engine document/layout.rs.

export enum Layout {
  FixedSize = 'fixed-size',
  SemiInfinite = 'semi-infinite',
  Infinite = 'infinite',
  ContinuousVertical = 'continuous-vertical'
}

export const LAYOUT_LABELS: Record<Layout, string> = {
  [Layout.FixedSize]: 'Fixed Size',
  [Layout.SemiInfinite]: 'Semi-Infinite (Continuous Vertical)',
  [Layout.Infinite]: 'Infinite',
  [Layout.ContinuousVertical]: 'Continuous Vertical'
}

export function isFixedSize(layout: Layout): boolean {
  return layout === Layout.FixedSize || layout === Layout.ContinuousVertical
}

export function isVerticalInfinite(layout: Layout): boolean {
  return layout === Layout.SemiInfinite || layout === Layout.Infinite || layout === Layout.ContinuousVertical
}
