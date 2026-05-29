import { useCallback, useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
// @ts-ignore — Vite gere ?url
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

/* Palette partagee : surligne le meme virement de la meme couleur sur les 2 releves. */
const PALETTE: { c: string; label: string }[] = [
  { c: '#FFE100', label: 'Jaune' },
  { c: '#7CF0A8', label: 'Vert' },
  { c: '#8AD2FF', label: 'Bleu' },
  { c: '#FFA8D6', label: 'Rose' },
  { c: '#FFB870', label: 'Orange' },
  { c: '#C9A8FF', label: 'Violet' }
]

const TUTO_KEY = 'mirror-tuto-hidden-v1'

interface Highlight {
  id: string
  pageIndex: number
  x: number
  y: number
  w: number
  h: number
  color: string
}

interface Draft {
  pageIndex: number
  x0: number
  y0: number
  x1: number
  y1: number
}

/* ---------- Rendu d'une page PDF dans un canvas ---------- */
function PdfPageCanvas({
  doc,
  pageNumber,
  scale
}: {
  doc: pdfjsLib.PDFDocumentProxy
  pageNumber: number
  scale: number
}): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    let task: pdfjsLib.RenderTask | null = null
    doc
      .getPage(pageNumber)
      .then((page) => {
        if (cancelled) return
        const viewport = page.getViewport({ scale })
        const canvas = ref.current
        if (!canvas) return
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        task = page.render({ canvasContext: ctx, viewport })
        task.promise.catch(() => {
          /* render annule lors d'un changement de scale : ignore */
        })
      })
      .catch(() => {
        /* ignore */
      })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, pageNumber, scale])

  return <canvas ref={ref} className="block" />
}

/* ---------- Un panneau (un releve) ---------- */
function MirrorPane({
  title,
  initialBytes,
  initialName,
  activeColor,
  eraseMode
}: {
  title: string
  initialBytes: ArrayBuffer | null
  initialName: string | null
  activeColor: string
  eraseMode: boolean
}): JSX.Element {
  const [bytes, setBytes] = useState<ArrayBuffer | null>(initialBytes)
  const [name, setName] = useState<string | null>(initialName)
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(0.85)
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(false)

  // (re)charge le document quand les bytes changent
  useEffect(() => {
    if (!bytes) {
      setDoc(null)
      setNumPages(0)
      return
    }
    let cancelled = false
    setLoading(true)
    const copy = bytes.slice(0)
    pdfjsLib
      .getDocument({ data: copy })
      .promise.then((d) => {
        if (cancelled) return
        setDoc(d)
        setNumPages(d.numPages)
        setHighlights([])
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [bytes])

  const open = useCallback(async () => {
    const paths = await window.api.openPdf(false)
    if (!paths || paths.length === 0) return
    const buf = await window.api.readPdf(paths[0])
    setBytes(buf)
    setName(paths[0].split('/').pop() || 'relevé')
  }, [])

  const removeHighlight = useCallback((id: string) => {
    setHighlights((prev) => prev.filter((h) => h.id !== id))
  }, [])

  const clamp = (v: number): number => Math.max(0, Math.min(1, v))

  const onPointerDown = (e: React.PointerEvent, pageIndex: number): void => {
    if (eraseMode || !doc) return
    if (e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = clamp((e.clientX - rect.left) / rect.width)
    const y = clamp((e.clientY - rect.top) / rect.height)
    setDraft({ pageIndex, x0: x, y0: y, x1: x, y1: y })
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    if (!draft) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = clamp((e.clientX - rect.left) / rect.width)
    const y = clamp((e.clientY - rect.top) / rect.height)
    setDraft((d) => (d ? { ...d, x1: x, y1: y } : null))
  }

  const onPointerUp = (): void => {
    if (!draft) return
    const x = Math.min(draft.x0, draft.x1)
    const y = Math.min(draft.y0, draft.y1)
    const w = Math.abs(draft.x1 - draft.x0)
    const h = Math.abs(draft.y1 - draft.y0)
    if (w > 0.004 && h > 0.004) {
      setHighlights((prev) => [
        ...prev,
        {
          id: 'h_' + Math.random().toString(36).slice(2, 9),
          pageIndex: draft.pageIndex,
          x,
          y,
          w,
          h,
          color: activeColor
        }
      ])
    }
    setDraft(null)
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col border border-black/10 rounded-lg bg-white overflow-hidden">
      {/* En-tete du panneau */}
      <div className="h-11 shrink-0 flex items-center gap-2 px-3 border-b border-black/10 bg-cream/50">
        <span className="text-xs font-semibold text-pretto whitespace-nowrap">{title}</span>
        <span className="text-xs text-black/50 truncate flex-1" title={name || ''}>
          {name || 'Aucun relevé'}
        </span>
        {doc && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setScale((s) => Math.max(0.4, +(s - 0.12).toFixed(2)))}
              className="w-6 h-6 rounded hover:bg-black/10 text-sm"
              title="Réduire"
            >
              −
            </button>
            <span className="text-[10px] text-black/50 w-8 text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={() => setScale((s) => Math.min(2, +(s + 0.12).toFixed(2)))}
              className="w-6 h-6 rounded hover:bg-black/10 text-sm"
              title="Agrandir"
            >
              +
            </button>
          </div>
        )}
        <button
          onClick={open}
          className="px-2 py-1 text-[11px] rounded bg-pretto text-white hover:bg-pretto/90 whitespace-nowrap"
        >
          {doc ? 'Changer…' : 'Ouvrir un relevé…'}
        </button>
        {highlights.length > 0 && (
          <button
            onClick={() => setHighlights([])}
            className="px-2 py-1 text-[11px] rounded text-red-500 hover:bg-red-500/10 whitespace-nowrap"
            title="Retirer tous les surlignages de ce relevé"
          >
            Tout effacer
          </button>
        )}
      </div>

      {/* Corps : pages defilantes */}
      <div className="flex-1 overflow-auto bg-black/[0.04] py-3 px-2">
        {!doc && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-black/40">
            <div className="text-4xl">📄</div>
            {loading ? (
              <div className="text-xs">Chargement…</div>
            ) : (
              <>
                <div className="text-sm">Aucun relevé ouvert dans ce panneau</div>
                <button
                  onClick={open}
                  className="px-3 py-1.5 text-xs rounded bg-pretto text-white hover:bg-pretto/90"
                >
                  Ouvrir un relevé…
                </button>
              </>
            )}
          </div>
        )}
        {doc &&
          Array.from({ length: numPages }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1 mb-4">
              <div
                className="relative shadow-md"
                style={{ width: 'fit-content', cursor: eraseMode ? 'default' : 'crosshair' }}
                onPointerDown={(e) => onPointerDown(e, i)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                <PdfPageCanvas doc={doc} pageNumber={i + 1} scale={scale} />
                {/* surlignages de la page i */}
                {highlights
                  .filter((h) => h.pageIndex === i)
                  .map((h) => (
                    <div
                      key={h.id}
                      onClick={() => (eraseMode ? removeHighlight(h.id) : undefined)}
                      title={eraseMode ? 'Cliquer pour retirer' : 'Surlignage'}
                      className="absolute"
                      style={{
                        left: `${h.x * 100}%`,
                        top: `${h.y * 100}%`,
                        width: `${h.w * 100}%`,
                        height: `${h.h * 100}%`,
                        backgroundColor: h.color,
                        opacity: 0.42,
                        mixBlendMode: 'multiply',
                        cursor: eraseMode ? 'pointer' : 'default',
                        pointerEvents: eraseMode ? 'auto' : 'none',
                        borderRadius: 2
                      }}
                    />
                  ))}
                {/* rectangle en cours de trace */}
                {draft && draft.pageIndex === i && (
                  <div
                    className="absolute pointer-events-none border border-black/40"
                    style={{
                      left: `${Math.min(draft.x0, draft.x1) * 100}%`,
                      top: `${Math.min(draft.y0, draft.y1) * 100}%`,
                      width: `${Math.abs(draft.x1 - draft.x0) * 100}%`,
                      height: `${Math.abs(draft.y1 - draft.y0) * 100}%`,
                      backgroundColor: activeColor,
                      opacity: 0.35,
                      borderRadius: 2
                    }}
                  />
                )}
              </div>
              <div className="text-[10px] text-black/40">
                Page {i + 1} / {numPages}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}

/* ---------- Conteneur : 2 panneaux + barre + tuto ---------- */
interface Props {
  mainBytes: ArrayBuffer | null
  mainName: string | null
  onClose: () => void
}

export default function MirrorCompare({ mainBytes, mainName, onClose }: Props): JSX.Element {
  const [activeColor, setActiveColor] = useState(PALETTE[0].c)
  const [eraseMode, setEraseMode] = useState(false)
  const [showTuto, setShowTuto] = useState(
    () => window.localStorage.getItem(TUTO_KEY) !== '1'
  )

  // Echap ferme la comparaison
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (showTuto) setShowTuto(false)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, showTuto])

  const dismissTuto = (dontShowAgain: boolean): void => {
    if (dontShowAgain) window.localStorage.setItem(TUTO_KEY, '1')
    setShowTuto(false)
  }

  return (
    <div className="fixed inset-0 z-[900] bg-cream flex flex-col">
      {/* Barre du haut */}
      <div className="h-14 shrink-0 bg-white border-b border-black/10 flex items-center px-4 gap-3">
        <span className="text-base font-semibold text-pretto">⇄ Comptes miroir</span>
        <span className="text-xs text-black/50 hidden md:inline">
          Compare deux relevés côte à côte
        </span>

        <div className="w-px h-7 bg-black/10 mx-1" />

        {/* Palette de surlignage partagee */}
        <span className="text-xs text-black/60">Surligneur :</span>
        {PALETTE.map((p) => (
          <button
            key={p.c}
            onClick={() => {
              setActiveColor(p.c)
              setEraseMode(false)
            }}
            title={p.label}
            className={[
              'w-7 h-7 rounded-full border transition-transform',
              !eraseMode && activeColor === p.c
                ? 'border-ink ring-2 ring-pretto/40 scale-110'
                : 'border-black/15 hover:scale-105'
            ].join(' ')}
            style={{ backgroundColor: p.c }}
          />
        ))}

        <button
          onClick={() => setEraseMode((v) => !v)}
          className={[
            'ml-2 px-3 py-1.5 rounded-md text-xs font-medium border',
            eraseMode
              ? 'bg-red-500 text-white border-red-500'
              : 'text-ink border-black/15 hover:bg-black/5'
          ].join(' ')}
          title="Mode gomme : clique un surlignage pour le retirer"
        >
          {eraseMode ? '⌫ Mode gomme actif' : '⌫ Retirer un surlignage'}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowTuto(true)}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-ink hover:bg-black/5 border border-black/15"
            title="Revoir le mode d'emploi"
          >
            ? Aide
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-ink/80 text-white hover:bg-ink"
          >
            ✕ Fermer la comparaison
          </button>
        </div>
      </div>

      {/* Les 2 panneaux */}
      <div className="flex-1 min-h-0 flex gap-3 p-3">
        <MirrorPane
          title="Relevé A"
          initialBytes={mainBytes}
          initialName={mainName}
          activeColor={activeColor}
          eraseMode={eraseMode}
        />
        <MirrorPane
          title="Relevé B"
          initialBytes={null}
          initialName={null}
          activeColor={activeColor}
          eraseMode={eraseMode}
        />
      </div>

      {/* Tutoriel */}
      {showTuto && (
        <div className="absolute inset-0 z-[950] bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-7">
            <div className="flex items-center gap-3 mb-3">
              <div className="text-3xl">⇄</div>
              <h2 className="text-xl font-bold text-pretto">Comptes miroir</h2>
            </div>
            <p className="text-sm text-ink/80 mb-4 leading-relaxed">
              Compare <strong>deux relevés de compte côte à côte</strong> pour repérer d'un coup
              d'œil les <strong>virements miroirs</strong> (un débit sur un compte = un crédit sur
              l'autre).
            </p>
            <ol className="text-sm text-ink/80 space-y-2.5 mb-5 list-decimal pl-5">
              <li>
                Le <strong>relevé A</strong> (gauche) est ton document déjà ouvert. Ouvre le{' '}
                <strong>relevé B</strong> (droite) avec « Ouvrir un relevé… ».
              </li>
              <li>
                Chaque panneau se <strong>navigue et se zoome indépendamment</strong> (molette pour
                défiler, −/+ pour zoomer).
              </li>
              <li>
                Choisis une <strong>couleur de surligneur</strong> en haut, puis{' '}
                <strong>glisse</strong> sur un montant. Surligne le virement sur A{' '}
                <em>et le même montant sur B</em> avec la <strong>même couleur</strong> : la paire
                miroir saute aux yeux.
              </li>
              <li>
                Pour corriger : « Retirer un surlignage » puis clique dessus, ou « Tout effacer »
                dans un panneau.
              </li>
            </ol>
            <p className="text-xs text-black/45 mb-5">
              Les surlignages servent à la comparaison visuelle (ils ne sont pas enregistrés dans le
              PDF). Pour des annotations définitives, utilise les outils Surligner / Texte sur le
              document principal.
            </p>
            <div className="flex items-center justify-between">
              <button
                onClick={() => dismissTuto(true)}
                className="text-xs text-black/50 hover:text-black/80"
              >
                Ne plus afficher
              </button>
              <button
                onClick={() => dismissTuto(false)}
                className="px-5 py-2 rounded-lg bg-pretto text-white text-sm font-semibold hover:bg-pretto/90"
              >
                Commencer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
