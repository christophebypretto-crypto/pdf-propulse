import * as pdfjsLib from 'pdfjs-dist'
// @ts-ignore — Vite gere ?url
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export interface ThumbResult {
  srcIndex: number
  dataUrl: string
  width: number
  height: number
}

/** Genere une miniature PNG dataURL pour chaque page d'un PDF. */
export async function renderPagesToThumbnails(
  data: ArrayBuffer,
  maxWidth = 200
): Promise<ThumbResult[]> {
  // pdfjs consomme l'ArrayBuffer — on copie pour que le buffer reste valide ensuite
  const copy = data.slice(0)
  const doc = await pdfjsLib.getDocument({ data: copy }).promise
  const out: ThumbResult[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 1 })
    const scale = maxWidth / viewport.width
    const scaled = page.getViewport({ scale })
    // Rendu 2x pour des miniatures nettes sur ecran Retina
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(scaled.width * dpr)
    canvas.height = Math.floor(scaled.height * dpr)
    const ctx = canvas.getContext('2d')!
    await page.render({
      canvasContext: ctx,
      viewport: scaled,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined
    }).promise
    out.push({
      srcIndex: i - 1,
      dataUrl: canvas.toDataURL('image/png'),
      width: scaled.width,
      height: scaled.height
    })
  }
  await doc.destroy()
  return out
}
