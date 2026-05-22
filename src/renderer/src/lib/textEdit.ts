import * as pdfjsLib from 'pdfjs-dist'

export interface TextHit {
  text: string
  // Coords normalisees [0,1], origine top-left de la page
  x: number
  y: number
  width: number
  height: number
  fontSize: number // taille en points PDF
  fontFamily: 'helvetica' | 'times' | 'courier'
  bold: boolean
  italic: boolean
}

function classifyFont(name: string): {
  family: 'helvetica' | 'times' | 'courier'
  bold: boolean
  italic: boolean
} {
  const lower = name.toLowerCase()
  const bold =
    lower.includes('bold') ||
    lower.includes('heavy') ||
    lower.includes('black') ||
    lower.includes('semibold') ||
    lower.includes('demi')
  const italic = lower.includes('italic') || lower.includes('oblique')
  let family: 'helvetica' | 'times' | 'courier' = 'helvetica'
  if (
    lower.includes('times') ||
    lower.includes('serif') && !lower.includes('sansserif') && !lower.includes('sans-serif')
  ) {
    family = 'times'
  } else if (lower.includes('courier') || lower.includes('mono')) {
    family = 'courier'
  }
  return { family, bold, italic }
}

/**
 * Trouve le texte sous le point clique sur une page.
 * Coords du clic normalisees [0,1] (top-left).
 * Renvoie null si aucun texte trouve a cet endroit.
 */
export async function findTextAtPoint(
  pdfjsDoc: pdfjsLib.PDFDocumentProxy,
  pageIndex: number,
  clickX: number,
  clickY: number
): Promise<TextHit | null> {
  const page = await pdfjsDoc.getPage(pageIndex + 1)
  const viewport = page.getViewport({ scale: 1 })
  const tc = await page.getTextContent()
  const pageW = viewport.width
  const pageH = viewport.height
  // Click en coords PDF (origine bottom-left)
  const px = clickX * pageW
  const py = pageH - clickY * pageH

  const styles = tc.styles as Record<string, { fontFamily?: string }>

  for (const item of tc.items) {
    if (!('str' in item) || !item.str) continue
    const t = item.transform as number[]
    const e = t[4]
    const f = t[5]
    const w = item.width || 0
    const h = item.height || 0
    if (w <= 0 || h <= 0) continue

    // Bounding box approx en coords PDF (texte non-rotated)
    // (e, f) est la baseline-left du texte ; le texte monte de "h" au-dessus
    if (px < e || px > e + w) continue
    if (py < f || py > f + h) continue

    const fontSize = Math.hypot(t[0], t[1]) || h
    const fontName = item.fontName || ''
    const styleName = styles[fontName]?.fontFamily || fontName
    const cls = classifyFont(styleName)

    return {
      text: item.str,
      x: e / pageW,
      y: (pageH - f - h) / pageH,
      width: w / pageW,
      height: h / pageH,
      fontSize,
      fontFamily: cls.family,
      bold: cls.bold,
      italic: cls.italic
    }
  }
  return null
}

/** Mappe la famille interne vers une stack CSS pour le rendu navigateur */
export function fontFamilyToCss(family: 'helvetica' | 'times' | 'courier'): string {
  if (family === 'times') return '"Times New Roman", Times, serif'
  if (family === 'courier') return '"Courier New", Courier, monospace'
  return 'Arial, Helvetica, sans-serif'
}
