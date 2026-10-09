// PDF support:
//  - export: render each document page / region to canvas and embed in jsPDF
//    (one PDF page per fixed-size document page).
//  - import: render each PDF page with pdf.js to a raster and insert it as a
//    bitmap image stroke laid out like a fixed-size document page.

import { jsPDF } from 'jspdf'
import 'svg2pdf.js'
import * as pdfjsLib from 'pdfjs-dist'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline'
import { Aabb, Vec2 } from '../../compose/geometry'
import type { Engine } from '../engine'
import { exportRegions, buildRegionSvg, type ExportRegion } from './export'
import { BitmapImageStroke, VectorImageStroke } from '../strokes/imagestroke'
import { convertPageToSvg } from './pdf-to-svg'

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker()

export interface PdfExportOptions {
  region: ExportRegion
  dpi: number
  withBackground: boolean
  withPattern: boolean
  optimizePrinting: boolean
  margin: number
}

export async function exportPDF(engine: Engine, opts: PdfExportOptions): Promise<void> {
  const regions = exportRegions(engine, opts.region)
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true })
  const svgPrefs = {
    region: opts.region,
    withBackground: true,
    withPattern: opts.withPattern,
    optimizePrinting: opts.optimizePrinting
  }

  for (let i = 0; i < regions.length; i++) {
    const drawBounds =
      opts.region === 'selection' ? regions[i].extend_by(opts.margin) : regions[i]
    // page size in points (96 css px -> 72 pt per inch)
    const wPt = drawBounds.width() * (72 / 96)
    const hPt = drawBounds.height() * (72 / 96)
    const orientation = wPt > hPt ? 'landscape' : 'portrait'
    if (i === 0) {
      pdf.addPage([wPt, hPt], orientation)
      // remove the default blank first page
      pdf.deletePage(1)
    } else {
      pdf.addPage([wPt, hPt], orientation)
    }

    // Build the page as vector SVG (filled bezier outlines, shapes, text and
    // vector images; only bitmaps are embedded images) and hand it to svg2pdf,
    // so the exported PDF is resolution independent like the desktop export.
    const svgString = buildRegionSvg(engine, drawBounds, svgPrefs)
    const svgEl = new DOMParser().parseFromString(svgString, 'image/svg+xml')
      .documentElement as unknown as SVGSVGElement
    await pdf.svg(svgEl, { x: 0, y: 0, width: wPt, height: hPt })
  }

  pdf.save(`${engine.fileName || 'rnote'}.pdf`)
}

export interface PdfImportResult {
  pages: number
}

export interface PdfImportOptions {
  pageStart: number
  pageEnd: number
  adjustDocument: boolean
  widthPerc: number
  pageSpacing: 'continuous' | 'one-per-page'
  pagesType: 'vector' | 'bitmap'
  bitmapScaleFactor: number
  password?: string
}
export function defaultPdfImportOptions(totalPages: number): PdfImportOptions {
  return {
    pageStart: 1,
    pageEnd: totalPages,
    adjustDocument: false,
    widthPerc: 50,
    pageSpacing: 'continuous',
    pagesType: 'vector',
    bitmapScaleFactor: 1.8
  }
}

export async function importPdf(
  engine: Engine,
  file: File,
  options?: PdfImportOptions
): Promise<PdfImportResult> {
  const buf = await file.arrayBuffer()
  const docParams: any = { data: buf }
  if (options?.password) docParams.password = options.password
  const pdf = await pdfjsLib.getDocument(docParams).promise
  const total = pdf.numPages
  const o = options ?? defaultPdfImportOptions(total)
  const start = Math.max(1, Math.min(total, o.pageStart))
  const end = Math.max(start, Math.min(total, o.pageEnd || total))

  const fmt = engine.document.format
  const targetW = o.adjustDocument ? fmt.width : fmt.width * (o.widthPerc / 100)
  const firstPage = await pdf.getPage(start)
  const firstVp = firstPage.getViewport({ scale: 1 })
  const zoom = targetW / firstVp.width

  let y = 0
  const strokes: (VectorImageStroke | BitmapImageStroke)[] = []
  for (let pi = start; pi <= end; pi++) {
    const page = await pdf.getPage(pi)
    const ivp = page.getViewport({ scale: 1 })
    const w = ivp.width * zoom
    const h = ivp.height * zoom
    const bounds = new Aabb(new Vec2(0, y), new Vec2(w, y + h))

    if (o.pagesType === 'vector') {
      const svg = await convertPageToSvg(page)
      strokes.push(new VectorImageStroke(svg, bounds))
    } else {
      const rs = Math.max(0.1, zoom * o.bitmapScaleFactor)
      const cvp = page.getViewport({ scale: rs })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(cvp.width)
      canvas.height = Math.ceil(cvp.height)
      const cctx = canvas.getContext('2d')!
      cctx.fillStyle = '#ffffff'
      cctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: cctx, viewport: cvp, canvas } as any).promise
      const dataUrl = canvas.toDataURL('image/png')
      strokes.push(new BitmapImageStroke(dataUrl, bounds, canvas.width, canvas.height))
    }

    if (o.adjustDocument) y += h
    else if (o.pageSpacing === 'continuous') y += h + 16
    else y += fmt.height
    page.cleanup()
  }
  engine.commitAddStrokes(strokes)
  const firstBounds = new Aabb(new Vec2(0, 0), new Vec2(targetW, firstVp.height * zoom))
  engine.camera.fitBounds(firstBounds, 60)
  return { pages: end - start + 1 }
}
