import { createWorker, Worker } from 'tesseract.js'

let worker: Worker | null = null
let workerLang = ''
let initPromise: Promise<Worker> | null = null
let lastLogger: ((line: string) => void) | null = null

export function setOcrLogger(fn: ((line: string) => void) | null): void {
  lastLogger = fn
}

/** Cree (ou reutilise) le worker Tesseract avec les langues demandees */
export async function getWorker(langs: string = 'fra+eng'): Promise<Worker> {
  if (worker && workerLang === langs) return worker
  if (initPromise && workerLang === langs) return initPromise

  initPromise = (async () => {
    if (worker) {
      await worker.terminate()
      worker = null
    }
    lastLogger?.('Initialisation du worker Tesseract…')
    const w = await createWorker(langs, 1, {
      logger: (m: { status: string; progress?: number }) => {
        const pct = m.progress !== undefined ? ` ${Math.round(m.progress * 100)}%` : ''
        lastLogger?.(`${m.status}${pct}`)
      },
      errorHandler: (e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        lastLogger?.(`ERREUR worker: ${msg}`)
      }
    })
    worker = w
    workerLang = langs
    lastLogger?.('Worker prêt')
    return w
  })()

  return initPromise
}

export interface OcrWord {
  text: string
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number } // pixels dans l'image source
}

export interface OcrResult {
  text: string
  words: OcrWord[]
  imageWidth: number
  imageHeight: number
}

/**
 * Lance l'OCR sur un canvas (rendu PDF d'une page) et retourne le texte + boites.
 * Coords retournees en pixels de l'image source.
 */
export async function ocrCanvas(
  canvas: HTMLCanvasElement,
  langs: string = 'fra+eng',
  onProgress?: (pct: number) => void
): Promise<OcrResult> {
  const w = await getWorker(langs)
  onProgress?.(10)
  const result = await w.recognize(canvas, {}, { blocks: true })
  onProgress?.(95)
  const data = result.data as unknown as {
    text: string
    words?: RawWord[]
    blocks?: RawBlock[]
  }

  // Tesseract v7 retourne soit data.words directement, soit la structure imbriquee blocks→paragraphs→lines→words
  let rawWords: RawWord[] = data.words || []
  if (rawWords.length === 0 && data.blocks) {
    rawWords = data.blocks.flatMap((b) =>
      (b.paragraphs || []).flatMap((p) =>
        (p.lines || []).flatMap((l) => l.words || [])
      )
    )
  }

  const words: OcrWord[] = rawWords.map((w) => ({
    text: w.text,
    confidence: w.confidence,
    bbox: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }
  }))
  onProgress?.(100)
  return {
    text: data.text,
    words,
    imageWidth: canvas.width,
    imageHeight: canvas.height
  }
}

interface RawWord {
  text: string
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

interface RawLine {
  words?: RawWord[]
}

interface RawParagraph {
  lines?: RawLine[]
}

interface RawBlock {
  paragraphs?: RawParagraph[]
}

/** Libere le worker (a appeler a la fermeture) */
export async function terminateOcrWorker(): Promise<void> {
  if (worker) {
    await worker.terminate()
    worker = null
    workerLang = ''
  }
  initPromise = null
}
