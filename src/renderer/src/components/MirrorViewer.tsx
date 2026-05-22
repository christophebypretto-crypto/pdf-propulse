import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

interface Props {
  pdfBytes: ArrayBuffer
  fileName: string | null
  onClose: () => void
}

/**
 * Visualiseur PDF simplifie pour la comparaison "comptes miroir" :
 * lecture seule, vertical-scroll, aucune annotation possible.
 * Affiche les pages a une echelle fixe (~600px de large par defaut).
 */
export default function MirrorViewer({ pdfBytes, fileName, onClose }: Props): JSX.Element {
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [pages, setPages] = useState<HTMLCanvasElement[]>([])
  const [scale, setScale] = useState(0.9)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setPages([])
    const copy = pdfBytes.slice(0)
    pdfjsLib
      .getDocument({ data: copy })
      .promise.then(async (d) => {
        if (cancelled) return
        setDoc(d)
        const canvases: HTMLCanvasElement[] = []
        for (let i = 1; i <= d.numPages; i++) {
          if (cancelled) return
          const page = await d.getPage(i)
          const viewport = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.className = 'bg-white shadow-md mx-auto'
          canvas.style.maxWidth = '100%'
          const ctx = canvas.getContext('2d')!
          await page.render({ canvasContext: ctx, viewport }).promise
          canvases.push(canvas)
        }
        if (!cancelled) setPages(canvases)
      })
      .catch(() => {
        /* ignore */
      })
    return () => {
      cancelled = true
    }
  }, [pdfBytes, scale])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.innerHTML = ''
    pages.forEach((canvas, i) => {
      const wrap = document.createElement('div')
      wrap.className = 'flex flex-col items-center gap-1 mb-6'
      wrap.appendChild(canvas)
      const label = document.createElement('div')
      label.className = 'text-xs text-black/40'
      label.textContent = `Page ${i + 1} / ${pages.length}`
      wrap.appendChild(label)
      container.appendChild(wrap)
    })
  }, [pages])

  return (
    <div className="h-full flex flex-col bg-black/[0.04] border-l-2 border-pretto/30">
      <div className="h-14 shrink-0 bg-white border-b border-black/10 flex items-center px-3 gap-2">
        <span className="text-sm font-medium text-pretto">⇄ Compte miroir</span>
        <span className="text-xs text-black/50 truncate flex-1" title={fileName || ''}>
          {fileName || ''}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setScale((s) => Math.max(0.3, +(s - 0.15).toFixed(2)))}
            className="w-7 h-7 rounded hover:bg-black/5 text-sm"
            title="Réduire"
          >
            −
          </button>
          <span className="text-xs text-black/60 w-10 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale((s) => Math.min(2, +(s + 0.15).toFixed(2)))}
            className="w-7 h-7 rounded hover:bg-black/5 text-sm"
            title="Agrandir"
          >
            +
          </button>
        </div>
        <button
          onClick={onClose}
          className="ml-2 px-3 py-1 text-xs rounded bg-red-500/90 text-white hover:bg-red-600"
          title="Fermer la comparaison"
        >
          ✕ Fermer
        </button>
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-auto py-4 px-2"
        style={{ scrollBehavior: 'smooth' }}
      >
        {!doc && (
          <div className="text-center text-xs text-black/40 py-8">Chargement du 2e PDF…</div>
        )}
      </div>
    </div>
  )
}
