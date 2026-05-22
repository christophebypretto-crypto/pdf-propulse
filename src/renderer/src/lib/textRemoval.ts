import { PDFDocument, rgb, degrees, StandardFonts, PDFFont } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'

function classifyFontName(name: string): {
  family: 'helvetica' | 'times' | 'courier'
  bold: boolean
  italic: boolean
} {
  const lower = name.toLowerCase()
  const bold =
    lower.includes('bold') ||
    lower.includes('heavy') ||
    lower.includes('black') ||
    lower.includes('semibold')
  const italic = lower.includes('italic') || lower.includes('oblique')
  let family: 'helvetica' | 'times' | 'courier' = 'helvetica'
  if (lower.includes('times') || (lower.includes('serif') && !lower.includes('sans'))) {
    family = 'times'
  } else if (lower.includes('courier') || lower.includes('mono')) {
    family = 'courier'
  }
  return { family, bold, italic }
}

function pickFont(
  family: 'helvetica' | 'times' | 'courier',
  bold: boolean,
  italic: boolean
): StandardFonts {
  if (family === 'times') {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic
    if (bold) return StandardFonts.TimesRomanBold
    if (italic) return StandardFonts.TimesRomanItalic
    return StandardFonts.TimesRoman
  }
  if (family === 'courier') {
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

export interface TextRemovalResult {
  bytes: ArrayBuffer
  removedCount: number
  pagesAffected: number[]
}

/**
 * Recherche un texte dans toutes les pages d'un PDF et recouvre chaque occurrence
 * avec un rectangle blanc opaque (en respectant la rotation du texte).
 *
 * Utile pour supprimer des watermarks (BROUILLON, DRAFT, COPY...) sans toucher
 * au contenu legitime autour.
 */
export async function removeTextFromPdf(
  data: ArrayBuffer,
  searchText: string,
  options: { caseSensitive?: boolean } = {}
): Promise<TextRemovalResult> {
  if (!searchText.trim()) {
    return { bytes: data, removedCount: 0, pagesAffected: [] }
  }

  const pdfjsDoc = await pdfjsLib.getDocument({ data: data.slice(0) }).promise
  const doc = await PDFDocument.load(data, { ignoreEncryption: true })
  let removedCount = 0
  const pagesAffected = new Set<number>()

  // Cache des fonts embedded pour ne pas re-embedder
  const fontCache = new Map<StandardFonts, PDFFont>()
  const getEmbeddedFont = async (sf: StandardFonts): Promise<PDFFont> => {
    if (fontCache.has(sf)) return fontCache.get(sf)!
    const f = await doc.embedFont(sf)
    fontCache.set(sf, f)
    return f
  }

  const needle = options.caseSensitive ? searchText : searchText.toUpperCase()

  for (let i = 0; i < pdfjsDoc.numPages; i++) {
    const pdfjsPage = await pdfjsDoc.getPage(i + 1)
    const textContent = await pdfjsPage.getTextContent()
    const page = doc.getPages()[i]
    const styles = textContent.styles as Record<string, { fontFamily?: string }>

    for (const item of textContent.items) {
      if (!('str' in item)) continue
      const itemStr = item.str
      const itemUp = options.caseSensitive ? itemStr : itemStr.toUpperCase()
      if (!itemUp.includes(needle)) continue

      const t = item.transform as number[]
      const a = t[0]
      const b = t[1]
      const e = t[4]
      const f = t[5]

      const rotationRad = Math.atan2(b, a)
      const rotationDeg = (rotationRad * 180) / Math.PI
      const fontSize = Math.hypot(a, b)

      // Detecte la police
      const fontName = item.fontName || ''
      const styleName = styles[fontName]?.fontFamily || fontName
      const cls = classifyFontName(styleName)
      const sf = pickFont(cls.family, cls.bold, cls.italic)
      const font = await getEmbeddedFont(sf)

      // Dessine le texte EN BLANC à la meme position/police/rotation.
      // Cela couvre les pixels des LETTRES (pas un rectangle), donc le
      // contenu en dessous (table, autres elements) reste visible autour.
      page.drawText(itemStr, {
        x: e,
        y: f,
        size: fontSize,
        font,
        color: rgb(1, 1, 1),
        rotate: degrees(rotationDeg)
      })
      removedCount++
      pagesAffected.add(i)
    }
  }

  await pdfjsDoc.destroy()
  const bytes = await doc.save()
  const out = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(out).set(bytes)
  return {
    bytes: out,
    removedCount,
    pagesAffected: Array.from(pagesAffected).sort((x, y) => x - y)
  }
}

/**
 * Recherche un texte et renvoie la liste des positions sans modifier le PDF.
 * Utile pour preview ("X occurrences trouvees sur N pages").
 */
export async function findTextOccurrences(
  data: ArrayBuffer,
  searchText: string,
  options: { caseSensitive?: boolean } = {}
): Promise<{ count: number; pagesAffected: number[] }> {
  if (!searchText.trim()) return { count: 0, pagesAffected: [] }
  const pdfjsDoc = await pdfjsLib.getDocument({ data: data.slice(0) }).promise
  let count = 0
  const pagesAffected = new Set<number>()
  const needle = options.caseSensitive ? searchText : searchText.toUpperCase()

  for (let i = 0; i < pdfjsDoc.numPages; i++) {
    const pdfjsPage = await pdfjsDoc.getPage(i + 1)
    const textContent = await pdfjsPage.getTextContent()
    for (const item of textContent.items) {
      if (!('str' in item)) continue
      const itemUp = options.caseSensitive ? item.str : item.str.toUpperCase()
      if (itemUp.includes(needle)) {
        count++
        pagesAffected.add(i)
      }
    }
  }

  await pdfjsDoc.destroy()
  return { count, pagesAffected: Array.from(pagesAffected).sort((a, b) => a - b) }
}
