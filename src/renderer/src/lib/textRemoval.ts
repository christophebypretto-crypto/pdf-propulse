import { PDFDocument, rgb, degrees } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'

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

  const needle = options.caseSensitive ? searchText : searchText.toUpperCase()

  for (let i = 0; i < pdfjsDoc.numPages; i++) {
    const pdfjsPage = await pdfjsDoc.getPage(i + 1)
    const textContent = await pdfjsPage.getTextContent()
    const page = doc.getPages()[i]
    const { height: ph } = page.getSize()

    for (const item of textContent.items) {
      if (!('str' in item)) continue
      const itemStr = item.str
      const itemUp = options.caseSensitive ? itemStr : itemStr.toUpperCase()
      if (!itemUp.includes(needle)) continue

      const t = item.transform as number[]
      // t = [a, b, c, d, e, f] => matrice 2D affine
      // (a, b) = colonne X, (c, d) = colonne Y, (e, f) = translation
      const a = t[0]
      const b = t[1]
      // const c = t[2]
      const d = t[3]
      const e = t[4]
      const f = t[5]

      const rotationRad = Math.atan2(b, a)
      const rotationDeg = (rotationRad * 180) / Math.PI

      // Taille du texte (echelle)
      const scaleX = Math.hypot(a, b)
      const scaleY = Math.hypot(t[2], d) || scaleX

      const itemW = (item.width || itemStr.length * 5) * 1.0
      const itemH = (item.height || scaleY) * 1.1

      // pdfjs renvoie (e, f) en coords PDF user space, origine bottom-left,
      // au niveau de la baseline du texte. On veut le coin bottom-left du rectangle.
      // Le texte s'etend vers la droite et vers le HAUT depuis (e, f).
      // Pour un rectangle qui couvre le texte : x = e, y = f - descent
      // (descent ~ 20% de la hauteur)
      void scaleX
      const padX = 1
      const padY = 1
      const rectX = e - padX
      const rectY = f - itemH * 0.25 - padY
      const rectW = itemW + padX * 2
      const rectH = itemH + padY * 2

      // pdf-lib drawRectangle avec rotation : la rotation est appliquee autour du
      // coin bas-gauche (x, y). On utilise donc les coords du coin (en PDF) puis
      // on rotate. La translation est deja dans (e, f), pas besoin d'ajuster.
      page.drawRectangle({
        x: rectX,
        y: rectY,
        width: rectW,
        height: rectH,
        color: rgb(1, 1, 1),
        opacity: 1,
        rotate: degrees(rotationDeg)
      })
      // height limit (avoid huge rectangles from pathological data)
      void ph
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
