import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib'

// Coordonnees normalisees [0,1] en espace page (origine top-left, comme l'ecran)
// La conversion vers PDF (origine bottom-left) se fait au moment du save.

export type Annotation =
  | HighlightAnnotation
  | PenAnnotation
  | TextAnnotation
  | ImageAnnotation
  | EraserAnnotation

export interface BaseAnnotation {
  id: string
  pageIndex: number
}

export interface HighlightAnnotation extends BaseAnnotation {
  kind: 'highlight'
  rect: { x: number; y: number; w: number; h: number } // normalise [0,1]
  color: string // hex
  opacity?: number // 0..1, defaut 0.35
}

export interface PenAnnotation extends BaseAnnotation {
  kind: 'pen'
  points: { x: number; y: number }[] // normalise [0,1]
  color: string
  width: number // pixels logiques @ scale 1
}

export interface TextAnnotation extends BaseAnnotation {
  kind: 'text'
  x: number // top-left, normalise
  y: number
  text: string
  size: number // pt en PDF
  color: string
  // Style optionnel — utilise quand on modifie du texte existant
  fontFamily?: 'helvetica' | 'times' | 'courier'
  bold?: boolean
  italic?: boolean
}

export interface ImageAnnotation extends BaseAnnotation {
  kind: 'image'
  x: number
  y: number
  w: number
  h: number
  dataUrl: string // PNG dataURL
}

export interface EraserAnnotation extends BaseAnnotation {
  kind: 'eraser'
  rect: { x: number; y: number; w: number; h: number } // normalise [0,1]
  color?: string // hex, defaut blanc #FFFFFF
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 11)
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace('#', '')
  return {
    r: parseInt(m.slice(0, 2), 16) / 255,
    g: parseInt(m.slice(2, 4), 16) / 255,
    b: parseInt(m.slice(4, 6), 16) / 255
  }
}

// Convertit y "top-left normalise" → coord PDF "bottom-left en points"
function toPdfY(yNorm: number, pageHeight: number): number {
  return (1 - yNorm) * pageHeight
}

function pickStandardFontEnum(
  family?: 'helvetica' | 'times' | 'courier',
  bold?: boolean,
  italic?: boolean
): StandardFonts {
  const f = family || 'helvetica'
  if (f === 'times') {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic
    if (bold) return StandardFonts.TimesRomanBold
    if (italic) return StandardFonts.TimesRomanItalic
    return StandardFonts.TimesRoman
  }
  if (f === 'courier') {
    if (bold && italic) return StandardFonts.CourierBoldOblique
    if (bold) return StandardFonts.CourierBold
    if (italic) return StandardFonts.CourierOblique
    return StandardFonts.Courier
  }
  if (bold && italic) return StandardFonts.HelveticaBoldOblique
  if (bold) return StandardFonts.HelveticaBold
  if (italic) return StandardFonts.HelveticaOblique
  return StandardFonts.Helvetica
}

/** Applique toutes les annotations dans le PDF et renvoie un nouvel ArrayBuffer */
export async function applyAnnotationsToPdf(
  data: ArrayBuffer,
  annotations: Annotation[]
): Promise<ArrayBuffer> {
  const doc = await PDFDocument.load(data, { ignoreEncryption: true })
  const font = await doc.embedFont(StandardFonts.Helvetica)
  // Cache pour eviter de re-embedder le meme StandardFont plusieurs fois
  const fontCache = new Map<StandardFonts, Awaited<ReturnType<typeof doc.embedFont>>>()
  fontCache.set(StandardFonts.Helvetica, font)
  const getFont = async (
    family?: 'helvetica' | 'times' | 'courier',
    bold?: boolean,
    italic?: boolean
  ) => {
    const e = pickStandardFontEnum(family, bold, italic)
    if (fontCache.has(e)) return fontCache.get(e)!
    const f = await doc.embedFont(e)
    fontCache.set(e, f)
    return f
  }
  const pages = doc.getPages()

  // Cache des images embed (pour ne pas re-embed la meme signature N fois)
  const imageCache = new Map<string, Awaited<ReturnType<PDFDocument['embedPng']>>>()

  for (const a of annotations) {
    const page = pages[a.pageIndex]
    if (!page) continue
    const { width: pw, height: ph } = page.getSize()
    const rotation = page.getRotation().angle % 360

    if (a.kind === 'highlight') {
      const c = hexToRgb(a.color)
      const x = a.rect.x * pw
      const y = toPdfY(a.rect.y + a.rect.h, ph)
      const w = a.rect.w * pw
      const h = a.rect.h * ph
      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        color: rgb(c.r, c.g, c.b),
        opacity: a.opacity ?? 0.35,
        rotate: degrees(0)
      })
    } else if (a.kind === 'pen') {
      const c = hexToRgb(a.color)
      const pts = a.points
      for (let i = 1; i < pts.length; i++) {
        const p1 = pts[i - 1]
        const p2 = pts[i]
        page.drawLine({
          start: { x: p1.x * pw, y: toPdfY(p1.y, ph) },
          end: { x: p2.x * pw, y: toPdfY(p2.y, ph) },
          thickness: a.width,
          color: rgb(c.r, c.g, c.b),
          opacity: 0.9
        })
      }
    } else if (a.kind === 'text') {
      const c = hexToRgb(a.color)
      const textFont = await getFont(a.fontFamily, a.bold, a.italic)
      const lines = a.text.split('\n')
      const lineHeight = a.size * 1.25
      lines.forEach((ln, i) => {
        const x = a.x * pw
        // y top-left de la 1ere ligne → on baisse de fontHeight pour la baseline
        const y = toPdfY(a.y, ph) - a.size - i * lineHeight
        page.drawText(ln, {
          x,
          y,
          size: a.size,
          font: textFont,
          color: rgb(c.r, c.g, c.b)
        })
      })
      // Ignore rotation for now (rotation parameter unused)
      void rotation
    } else if (a.kind === 'eraser') {
      const c = hexToRgb(a.color || '#FFFFFF')
      const x = a.rect.x * pw
      const y = toPdfY(a.rect.y + a.rect.h, ph)
      const w = a.rect.w * pw
      const h = a.rect.h * ph
      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        color: rgb(c.r, c.g, c.b),
        opacity: 1
      })
    } else if (a.kind === 'image') {
      let img = imageCache.get(a.dataUrl)
      if (!img) {
        const b64 = a.dataUrl.split(',')[1]
        const bin = atob(b64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        img = await doc.embedPng(bytes)
        imageCache.set(a.dataUrl, img)
      }
      const x = a.x * pw
      const y = toPdfY(a.y + a.h, ph)
      const w = a.w * pw
      const h = a.h * ph
      page.drawImage(img, { x, y, width: w, height: h })
    }
  }

  const bytes = await doc.save()
  const out = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(out).set(bytes)
  return out
}
