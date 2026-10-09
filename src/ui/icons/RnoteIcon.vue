<script setup lang="ts">
// Inline symbolic icon set (24x24, stroke-based, GNOME/adwaita style).
// Names mirror rnote's icon names where possible.
import { computed } from 'vue'
import { NATIVE_ICONS } from './nativeIcons'

const props = withDefaults(defineProps<{ name: string; filled?: boolean }>(), { filled: false })

// Each entry is raw inner SVG markup drawn on a 24x24 grid.
const ICONS: Record<string, string> = {
  // ---- tools ----
  brush: '<path d="M4 20c2.5 0.5 5-1 5.5-3.5C10 14 8 12.5 5.5 13 4 14.5 3.5 17.5 4 20Z"/><path d="M9.5 16.5 18 8c1.2-1.2 2.5-2.8 2-4.5-.2-.7-.9-1-1.5-.8C16.8 3 15 4.2 14 5.5l-8 8.5"/>',
  'brush-marker': '<path d="M5 15 15 5l4 4L9 19H5Z"/><path d="M3 21h6"/><path d="M14 6l4 4"/>',
  'brush-solid': '<path d="M4 20c2.5 0.5 5-1 5.5-3.5C10 14 8 12.5 5.5 13 4 14.5 3.5 17.5 4 20Z"/><path d="M9.5 16.5 18 8c1.2-1.2 2.5-2.8 2-4.5-.2-.7-.9-1-1.5-.8C16.8 3 15 4.2 14 5.5l-8 8.5"/>',
  'brush-textured':
    '<circle cx="6" cy="18" r="1.1"/><circle cx="9.5" cy="16" r="1.1"/><circle cx="12.5" cy="13" r="1.1"/><circle cx="15.5" cy="10" r="1.1"/><circle cx="18.5" cy="7" r="1.1"/><circle cx="8" cy="19.5" r="0.9"/><circle cx="13" cy="16.5" r="0.9"/><circle cx="17" cy="12.5" r="0.9"/>',
  shaper: '<path d="M8 4 12 8 8 12 4 8Z"/><path d="m15 9 4 4-4 4-4-4Z" opacity="0.92"/><circle cx="12" cy="17.5" r="1.8"/><path d="m12.8 12.8 1.4 1.4"/>',
  typewriter:
    '<path d="M6.5 5 11 19M8 14h6M13 5l4.5 14"/><path d="M18 5v14M16 5h4M16 19h4" stroke-linecap="square"/>',
  eraser: '<path d="M16 4 20 8 9 19H4l-1-1Z"/><path d="M9 9l6 6"/><path d="M3 21h18"/>',
  'eraser-trash':
    '<path d="M14 5 19 10 10 19H5l-1-1Z"/><path d="M4 4h16M9 4 7 2M15 4l2-2"/><path d="M10 21h10"/>',
  'eraser-split':
    '<path d="M15 4 20 9 11 18H6l-1-1Z"/><path d="M13 6l5 5"/><path d="M3 21h8" stroke-dasharray="2 2"/>',
  selector:
    '<path d="M5 3l6 16 2-6.5L19.5 11Z"/>',
  'selector-polygon':
    '<path d="M7 4l12 4-3 12-11-3Z"/><circle cx="7" cy="4" r="1.4"/><circle cx="19" cy="8" r="1.4"/><circle cx="16" cy="20" r="1.4"/><circle cx="5" cy="17" r="1.4"/>',
  'selector-rectangle':
    '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 3"/>',
  'selector-single': '<path d="M5 3l6 16 2-6.5L19.5 11Z"/>',
  'selector-path':
    '<path d="M4 18c4-10 12-10 16-2" stroke-dasharray="2.5 2.5"/><circle cx="4" cy="18" r="1.3"/><circle cx="20" cy="16" r="1.3"/>',
  tools: '<path d="M14.5 5.5a3.5 3.5 0 0 0-4.7 4.2L4 15.5 8.5 20l5.8-5.8a3.5 3.5 0 0 0 4.2-4.7l-2.3 2.3-2-2Z"/>',
  'tools-verticalspace':
    '<path d="M12 3v18"/><path d="M8 6l4-3 4 3"/><path d="M8 18l4 3 4-3"/><path d="M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4"/>',
  'tools-offsetcamera':
    '<path d="M8 11V8a4 4 0 1 1 8 0v3"/><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M12 14v3"/>',
  'tools-zoom': '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/><path d="M11 8v6M8 11h6"/>',
  laser: '<path d="M4 18 17 5l2 2L7 19Z"/><path d="M15 7l2 2"/><path d="M3 21h6"/><circle cx="5" cy="19" r="1"/>',

  // ---- shapes ----
  'shape-line': '<path d="M4 20 20 4"/>',
  'shape-arrow': '<path d="M4 20 20 4"/><path d="M11 4h9v9"/>',
  'shape-rectangle': '<rect x="4" y="5" width="16" height="14" rx="1"/>',
  'shape-ellipse': '<ellipse cx="12" cy="12" rx="8" ry="7"/>',
  'shape-polygon': '<path d="M12 3 21 9v9l-9 4-9-4V9Z"/>',
  'shape-polyline': '<path d="M3 18 8 8l5 6 5-9"/><circle cx="3" cy="18" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="13" cy="14" r="1.2"/><circle cx="18" cy="5" r="1.2"/>',
  'shape-quadbez': '<path d="M4 19C4 9 10 5 20 5"/><path d="M4 19 10 5"/><circle cx="10" cy="5" r="1.3"/>',
  'shape-cubbez': '<path d="M4 19c0-8 6-2 8-7s2-7 8-7"/><path d="M4 19 8 10M12 12l8-7"/>',
  'shape-grid':
    '<rect x="4" y="4" width="16" height="16" rx="0.5"/><path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/>',
  'shape-coordsystem2d':
    '<path d="M4 18h15M4 18V3"/><path d="M16 15l3 3-3 3M1 6l3-3 3 3"/>',
  'shape-coordsystem3d':
    '<path d="M12 19V5M12 19 4 14M12 19l8-5"/><path d="M12 5l-2.5 2.5L12 10l2.5-2.5Z"/><path d="M4 14l-2-1 2-2M20 14l2-1-2-2"/>',
  'shape-quadrantcoordsystem2d':
    '<path d="M4 20V6M4 20h14"/><path d="M1 9l3-3 3 3M15 17l3 3 3-3"/>',
  'shape-fociellipse':
    '<ellipse cx="12" cy="12" rx="8" ry="6"/><circle cx="8" cy="12" r="1.3"/><circle cx="16" cy="12" r="1.3"/><path d="M8 12 12 7l4 5"/>',

  // ---- brush path modelling ----
  'builder-simple': '<path d="M4 18 9 9l5 6 6-9"/><circle cx="4" cy="18" r="1"/><circle cx="9" cy="9" r="1"/><circle cx="14" cy="15" r="1"/><circle cx="20" cy="6" r="1"/>',
  'builder-curved': '<path d="M4 18C8 4 16 20 20 6"/>',
  'builder-modeled': '<path d="M4 16c4-8 12-8 16 0" stroke-width="2.4"/><path d="M4 16c4-8 12-8 16 0" opacity="0.4"/>',

  // ---- actions ----
  undo: '<path d="M8 6 4 10l4 4"/><path d="M4 10h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="M16 6l4 4-4 4"/><path d="M20 10H10a6 6 0 0 0 0 12h3"/>',
  save: '<path d="M5 4h11l3 3v13H5Z"/><path d="M8 4v5h7V4M8 20v-7h8v7"/>',
  open: '<path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/>',
  'doc-new': '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/><path d="M12 11v6M9 14h6"/>',
  'tab-new': '<path d="M4 6h16v12H4Z"/><path d="M12 9v6M9 12h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  'app-menu': '<path d="M4 7h16M4 12h16M4 17h16"/>',
  sidebar: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M9 5v14"/>',
  focus: '<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
  duplicate: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M4 16V4h12"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M4 16V4h12"/>',
  cut: '<circle cx="7" cy="7" r="2.4"/><circle cx="7" cy="17" r="2.4"/><path d="M9 8.5 20 18M9 15.5 20 6"/>',
  paste: '<rect x="5" y="5" width="14" height="15" rx="1.5"/><rect x="8" y="3" width="8" height="4" rx="1"/>',
  'select-all': '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 3"/><path d="M8 12h8M12 8v8"/>',
  'deselect-all': '<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 3"/><path d="M5 5l14 14"/>',
  'invert-color': '<path d="M12 3 4 11a8 8 0 1 0 16 0Z"/><path d="M12 7v12" opacity="0.5"/>',
  'lock-aspect':
    '<path d="M9 15 15 9"/><path d="M7 11l-2.5 2.5a3.5 3.5 0 0 0 5 5L12 16"/><path d="M17 13l2.5-2.5a3.5 3.5 0 0 0-5-5L12 8"/>',
  'zoom-in': '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5M11 8v6M8 11h6"/>',
  'zoom-out': '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5M8 11h6"/>',
  'zoom-reset': '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  'fit-width': '<path d="M4 5v14M20 5v14M8 12h8"/><path d="M11 9l3 3-3 3"/>',
  'real-size': '<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  check: '<path d="M4 12.5 10 18 20 6"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  'chevron-up': '<path d="M6 15l6-6 6 6"/>',
  'color-picker': '<path d="M20.5 3.5l-2-2c-.8-.8-2-.8-2.8 0L5 12.2c-.3.3-.5.7-.6 1.1l-.9 4 4-.9c.4-.1.8-.3 1.1-.6l10.7-10.7c.8-.8.8-2 0-2.8z"/><path d="M4.5 17.5 3 21l3.5-1.5"/>',
  'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
  export: '<path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M4 14v5h16v-5"/>',
  import: '<path d="M12 4v11"/><path d="M8 11l4 4 4-4"/><path d="M4 14v5h16v-5"/>',
  print: '<path d="M7 9V3h10v6"/><rect x="4" y="9" width="16" height="8" rx="1.5"/><path d="M7 14h10v7H7Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  keyboard: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
  reset: '<path d="M4 12a8 8 0 1 1 3 6.2"/><path d="M4 18v-4h4"/>',
  bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7ZM7 12h7a3.5 3.5 0 0 1 0 7H7Z"/>',
  italic: '<path d="M10 5h8M6 19h8M14 5l-4 14"/>',
  underline: '<path d="M6 4v9a6 6 0 0 0 12 0V4M5 21h14"/>',
  strikethrough: '<path d="M5 12h14M7 7.5C8 5.5 10 5 12 5s4 .5 5 2.5M8 14c1 2 2.5 2.5 4 2.5s3-.5 4-2.5"/>',
  'align-start': '<path d="M4 5v14M8 7h10v3H8ZM8 14h7v3H8Z"/>',
  'align-center': '<path d="M4 5v14M8 7h8v3H8ZM10 14h4v3h-4Z"/>',
  'align-end': '<path d="M20 5v14M6 7h10v3H6ZM9 14h7v3H9Z"/>',
  'align-fill': '<path d="M4 5v14M20 5v14M7 7h10v3H7ZM7 14h10v3H7Z"/>',
  font: '<path d="M5 20 12 4l7 16M8 14h8"/>',
  emoji: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>',
  folder: '<path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/>',
  file: '<path d="M7 3h7l5 5v13H7Z"/><path d="M14 3v5h5"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-1 2-2 0-1.5 1.2-2 2-2h1a4 4 0 0 0 4-4c0-5-4-8-9-8Z"/><circle cx="8" cy="10" r="1"/><circle cx="12" cy="8" r="1"/><circle cx="16" cy="10" r="1"/>',
  bucket: '<path d="M4 11 12 3l8 8-8 8Z"/><path d="M4 11h16"/><path d="M4 11c-2 2-2 5 0 7 1.2 1.2 3 1.2 4 0"/>',
  'tab-overview': '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  canvasmenu: '<circle cx="5" cy="12" r="1.6"/><path d="M8 12h11"/><circle cx="17" cy="6" r="1.6"/><path d="M3 6h11"/><circle cx="9" cy="18" r="1.6"/><path d="M3 18h3M12 18h9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
  moon: '<path d="M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10Z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="M13 7l4 4"/>',
  'page-add': '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4M12 11v6M9 14h6"/>',
  'page-remove': '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4M9.5 14h5"/>',
  home: '<path d="M4 11 12 4l8 7M6 10v10h12V10"/><path d="M10 20v-6h4v6"/>',
  sound: '<path d="M4 10v4h4l5 4V6L8 10Z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  'sound-off': '<path d="M4 10v4h4l5 4V6L8 10Z"/><path d="M16 9l5 6M21 9l-5 6"/>',
  touch: '<path d="M9 11V6a2 2 0 1 1 4 0v5"/><path d="M13 11V5a2 2 0 1 1 4 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2-3.5c-.6-1 0-2.3 1.2-2.3.6 0 1.2.3 1.5.8L8 13"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M14 11V6.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2.5-4c-.6-1 .2-2.2 1.3-2.2.6 0 1 .3 1.4.8L8 15"/>',
  pin: '<path d="M9 3h6l-1 7 3 3v2H7v-2l3-3Z"/><path d="M12 15v6"/>',
  grid: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/>',
  dot: '<circle cx="12" cy="12" r="4.5"/>',
  dots: '<circle cx="6" cy="6" r="1.4"/><circle cx="12" cy="6" r="1.4"/><circle cx="18" cy="6" r="1.4"/><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/><circle cx="6" cy="18" r="1.4"/><circle cx="12" cy="18" r="1.4"/><circle cx="18" cy="18" r="1.4"/>',
  lines: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  'iso-grid': '<path d="M12 3v18M3 8l9 5 9-5M3 16l9 5 9-5"/>',
  'iso-dots':
    '<circle cx="12" cy="4" r="1.2"/><circle cx="4" cy="8.5" r="1.2"/><circle cx="20" cy="8.5" r="1.2"/><circle cx="8" cy="13" r="1.2"/><circle cx="16" cy="13" r="1.2"/><circle cx="12" cy="17.5" r="1.2"/>',
  external: '<path d="M14 5h5v5"/><path d="M19 5l-9 9"/><path d="M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3.5 12h17"/><path d="M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18"/>',
  help: '<path d="M4 5.5h16a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5H9l-4 3v-3H4a.5.5 0 0 1-.5-.5V6a.5.5 0 0 1 .5-.5Z"/><path d="M9.8 9.3a2.2 2.2 0 1 1 3 2c-.6.3-.8.7-.8 1.3"/><path d="M12 15h.01"/>',
  bug: '<rect x="8.5" y="7" width="7" height="12" rx="3.5"/><path d="M12 7.5V19M9 11H5M9 14.5H5.5M9 18H6M15 11h4M15 14.5h3.5M15 18h3M9.5 7.5 8 5.2M14.5 7.5 16 5.2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  refresh: '<path d="M4 12a8 8 0 1 1 2.5 5.8"/><path d="M4 18v-4h4"/>',
  warning: '<path d="M12 3 22 20H2Z"/><path d="M12 10v5M12 18h.01"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7"/><path d="M12 17h.01"/>',
  rnote:
    '<rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" stroke="none"/><path d="M8 16c2 .4 4-.8 4.4-2.8.4-2-1.2-3.2-3.2-2.8-1.2.2-1.6 1.4-1.2 2.6" stroke="#fff"/><path d="M12.4 13.2 16 9.6" stroke="#fff"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
  rotate: '<path d="M4 12a8 8 0 1 1 2.3 5.7"/><path d="M4 18v-4h4"/>',
  'resize-handle': '<circle cx="12" cy="12" r="2.5"/>',
  pen: '<path d="M4 20l1-4L16 5l3 3L8 19Z"/><path d="M14 7l3 3"/>',
  workspaces:
    '<rect x="3.5" y="4.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="4.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="12.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="12.5" width="7" height="7" rx="1.5"/>'
}

const ALIASES: Record<string, string> = {
  brush: 'pen-brush',
  shaper: 'pen-shaper',
  typewriter: 'pen-typewriter',
  eraser: 'pen-eraser',
  selector: 'pen-selector',
  tools: 'pen-tools',
  workspaces: 'workspacebrowser',
  focus: 'focus-mode',
  save: 'save',
  sidebar: 'sidebar-reveal',
  canvasmenu: 'canvasmenu',
  settings: 'settings',
  palette: 'preferences-color',
  bucket: 'fill-color',
  stroke: 'stroke-color',
  undo: 'edit-undo',
  redo: 'edit-redo',
  'tab-new': 'tab-new',
  'fit-width': 'zoom-fit-width',
  'real-size': 'zoom-real-width',
  'page-remove': 'remove-page',
  'page-add': 'add-page',
  'brush-marker': 'pen-brush-style-marker',
  'brush-solid': 'pen-brush-style-solid',
  'brush-textured': 'pen-brush-style-textured',
  'shaper-smooth': 'pen-shaper-style-smooth',
  'shaper-rough': 'pen-shaper-style-rough',
  'shape-line': 'shapebuilder-line',
  'shape-arrow': 'shapebuilder-arrow',
  'shape-rectangle': 'shapebuilder-rectangle',
  'shape-grid': 'shapebuilder-grid',
  'shape-coordsystem2d': 'shapebuilder-coordsystem2d',
  'shape-coordsystem3d': 'shapebuilder-coordsystem3d',
  'shape-quadrantcoordsystem2d': 'shapebuilder-quadrantcoordsystem2d',
  'shape-ellipse': 'shapebuilder-ellipse',
  'shape-fociellipse': 'shapebuilder-fociellipse',
  'shape-quadbez': 'shapebuilder-quadbez',
  'shape-cubbez': 'shapebuilder-cubbez',
  'shape-polyline': 'shapebuilder-polyline',
  'shape-polygon': 'shapebuilder-polygon',
  'tools-verticalspace': 'pen-tools-verticalspacetool',
  'tools-offsetcamera': 'pen-tools-offsetcameratool',
  'tools-zoom': 'pen-tools-zoomtool',
  'tools-laser': 'pen-tools-laser',
  'eraser-trash': 'pen-eraser-trash-colliding-strokes',
  'eraser-split': 'pen-eraser-split-colliding-strokes',
  'selector-polygon': 'pen-selector-polygon',
  'selector-rectangle': 'pen-selector-rectangle',
  'selector-single': 'pen-selector-single',
  'selector-path': 'pen-selector-intersectingpath',
  'lock-aspect': 'selection-resize-lock-aspectratio',
  'select-all': 'selection-select-all',
  'deselect-all': 'selection-deselect-all',
  'invert-color': 'selection-invert-color',
  duplicate: 'selection-duplicate',
  'text-bold': 'text-bold',
  'text-italic': 'text-italic',
  'text-underline': 'text-underline',
  'text-strikethrough': 'text-strikethrough',
  'text-align-start': 'text-align-start',
  'text-align-center': 'text-align-center',
  'text-align-end': 'text-align-end',
  'text-align-fill': 'text-align-fill',
  emojichooser: 'emojichooser',
  'typewriter-font': 'pen-typewriter-fontchooser',
  reset: 'reset-state',
  trash: 'trash'
}

const resolvedName = computed(() => ALIASES[props.name] ?? props.name)
const isNative = computed(() => Boolean(NATIVE_ICONS[resolvedName.value]))
const inner = computed(() => NATIVE_ICONS[resolvedName.value] ?? ICONS[props.name] ?? ICONS['question'])
const cls = computed(() => ['icon-svg', props.filled ? 'fill' : ''])
</script>

<template>
  <span class="icon" :class="{ sm: $attrs.size === 'sm' }">
    <svg viewBox="0 0 24 24" :class="cls">
      <g :class="{ native: isNative }" :transform="isNative ? 'scale(1.5)' : undefined" v-html="inner" />
    </svg>
  </span>
</template>

<style scoped>
.icon {
  display: inline-flex;
}
.icon :deep(.native) {
  fill: currentColor;
  stroke: none;
}
</style>
