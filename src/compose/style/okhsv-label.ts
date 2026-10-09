import { converter, type CuloriColor } from 'culori'
import type { Color } from './color'

const toOkhsv = converter('okhsv')

// Port of rnote-ui utils::color_to_hsv_label_string. Culori implements the
// same Björn Ottosson Okhsv conversion used by the Rust `palette` crate.
export function colorToHsvLabelString(color: Color): string {
  const rgb: CuloriColor = { mode: 'rgb', r: color.r, g: color.g, b: color.b, alpha: color.a }
  const okhsv = toOkhsv(rgb)
  const alpha = color.a
  const hue = okhsv.h ?? 0
  const saturation = okhsv.s ?? 0
  const value = okhsv.v ?? 0
  const eps = 1.1920928955078125e-7

  const minSaturated = Math.abs(saturation) <= eps || saturation <= 0
  const minBright = Math.abs(value) <= eps || value <= 0
  const maxBright = (Math.abs(value - 1) <= eps || value >= 1)
  const minAlpha = Math.abs(alpha) <= eps || alpha <= 0

  let hueString = 'grey'
  if (!minSaturated) {
    if (hue < 0) hueString = 'rose'
    else if (hue < 40) hueString = 'red'
    else if (hue < 80) hueString = 'orange'
    else if (hue < 108) hueString = 'yellow'
    else if (hue < 120) hueString = 'chartreuse-green'
    else if (hue < 150) hueString = 'green'
    else if (hue < 180) hueString = 'spring-green'
    else if (hue < 210) hueString = 'cyan'
    else if (hue < 240) hueString = 'azure'
    else if (hue < 280) hueString = 'blue'
    else if (hue < 315) hueString = 'violet'
    else if (hue < 345) hueString = 'magenta'
    else hueString = 'rose'
  }

  let saturationString = ''
  if (!minSaturated) {
    if (saturation < 0.25) saturationString = 'greyish'
    else if (saturation < 0.5) saturationString = ''
    else if (saturation < 0.75) saturationString = 'strong'
    else saturationString = 'vivid'
  }

  let valueString: string
  if (value < 0.25) valueString = 'very-dark'
  else if (value < 0.5) valueString = 'dark'
  else if (value < 0.75) valueString = 'mid'
  else valueString = 'bright'

  let alphaString: string
  if (alpha < 0.333) alphaString = 'transparent'
  else if (alpha < 0.667) alphaString = 'translucent'
  else if (alpha < 1) alphaString = 'slightly-translucent'
  else alphaString = ''

  if (minAlpha) return 'fully transparent'
  if (minSaturated && minBright) return 'black'
  if (minSaturated && maxBright) return 'white'
  return [alphaString, saturationString, valueString, hueString].filter(Boolean).join(' ')
}
