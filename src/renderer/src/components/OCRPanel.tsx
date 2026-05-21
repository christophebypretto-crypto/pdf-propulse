import { useEffect, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { ocrCanvas, setOcrLogger } from '../lib/ocr'
import {
  makeSearchablePdf,
  ocrToEditableAnnotations,
  SearchableProgress
} from '../lib/searchable'
import { TextAnnotation } from '../lib/annotations'

interface Props {
  pdfBytes: ArrayBuffer
  numPages: number
  currentPage: number
  ocrZoneActive: boolean
  zoneResult: string | null
  onSearchableReady: (newBytes: ArrayBuffer) => void
  onToggleZoneMode: () => void
  onAddEditableAnnotations: (annotations: TextAnnotation[]) => void
  onClearZoneResult: () => void
}

export default function OCRPanel({
  pdfBytes,
  numPages,
  currentPage,
  ocrZoneActive,
  zoneResult,
  onSearchableReady,
  onToggleZoneMode,
  onAddEditableAnnotations,
  onClearZoneResult
}: Props): JSX.Element {
  const [result, setResult] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [progressLabel, setProgressLabel] = useState('')
  const [progressPct, setProgressPct] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  useEffect(() => {
    setOcrLogger((line) => {
      setLogs((prev) => [...prev.slice(-40), line])
      setProgressLabel(line)
    })
    return () => setOcrLogger(null)
  }, [])

  async function runOnPage(idx: number) {
    setBusy(true)
    setError(null)
    setResult('')
    setProgressLabel('Préparation…')
    setProgressPct(5)
    try {
      const copy = pdfBytes.slice(0)
      const doc = await pdfjsLib.getDocument({ data: copy }).promise
      const page = await doc.getPage(idx + 1)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport }).promise
      await doc.destroy()
      setProgressLabel('Reconnaissance des caractères (Tesseract local)…')
      const ocr = await ocrCanvas(canvas, 'fra+eng', (pct) => {
        setProgressPct(10 + pct * 0.85)
      })
      setResult(ocr.text)
      setProgressPct(100)
      setProgressLabel('Terminé')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur OCR')
    } finally {
      setBusy(false)
    }
  }

  async function makeEditable() {
    const ok = window.confirm(
      'Cette opération va lancer un OCR sur toutes les pages et créer un calque de texte éditable par-dessus le PDF.\n\n' +
        '⚠️ La qualité du PDF peut être altérée : le texte reconnu sera approximatif (erreurs possibles), ' +
        'la mise en forme exacte ne sera pas préservée, et tu devras peut-être corriger des mots.\n\n' +
        'Le contenu visuel original reste en place sous le calque. Tu pourras ensuite éditer / déplacer / supprimer chaque ligne.\n\n' +
        'Continuer ?'
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    setResult('')
    setProgressLabel('OCR + extraction des lignes…')
    setProgressPct(0)
    try {
      const annotations = await ocrToEditableAnnotations(pdfBytes, (p) => {
        setProgressLabel(`Page ${p.page} / ${p.totalPages}`)
        setProgressPct(((p.page - 1) / p.totalPages) * 100 + p.pct / p.totalPages)
      })
      onAddEditableAnnotations(annotations)
      setProgressPct(100)
      setProgressLabel(`${annotations.length} ligne(s) de texte ajoutées comme annotations éditables. Active l'outil Texte pour les modifier.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur OCR')
    } finally {
      setBusy(false)
    }
  }

  async function makeSearchable() {
    setBusy(true)
    setError(null)
    setResult('')
    setProgressLabel('Démarrage de l\'OCR…')
    setProgressPct(0)
    try {
      const out = await makeSearchablePdf(pdfBytes, (p: SearchableProgress) => {
        setProgressLabel(`Page ${p.page} / ${p.totalPages}`)
        setProgressPct(((p.page - 1) / p.totalPages) * 100 + (p.pct / p.totalPages))
      })
      setProgressPct(100)
      setProgressLabel('PDF rendu recherchable. Pense à enregistrer.')
      onSearchableReady(out)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur OCR')
    } finally {
      setBusy(false)
    }
  }

  function copy() {
    navigator.clipboard.writeText(result).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <aside className="w-80 shrink-0 bg-white border-l border-black/10 flex flex-col">
      <div className="px-4 py-3 border-b border-black/10">
        <h3 className="font-semibold text-sm">Reconnaissance de texte (OCR)</h3>
        <p className="text-xs text-black/50 mt-1">
          Tesseract local · gratuit · langues FR + EN
        </p>
      </div>

      <div className="px-4 py-3 space-y-2 border-b border-black/5">
        <button
          onClick={() => runOnPage(currentPage)}
          disabled={busy}
          className="w-full px-3 py-2 rounded-md bg-pretto text-white text-sm font-medium hover:bg-pretto/90 disabled:opacity-40"
        >
          Lancer OCR sur la page {currentPage + 1}
        </button>
        <button
          onClick={onToggleZoneMode}
          disabled={busy}
          className={[
            'w-full px-3 py-2 rounded-md border text-sm font-medium disabled:opacity-40 transition-colors',
            ocrZoneActive
              ? 'bg-olive text-white border-olive'
              : 'bg-white text-ink border-black/15 hover:bg-black/5'
          ].join(' ')}
        >
          {ocrZoneActive ? '✓ Mode Zone OCR actif — dessine un rectangle' : 'OCR sur une zone (drag)'}
        </button>
        <button
          onClick={makeSearchable}
          disabled={busy}
          className="w-full px-3 py-2 rounded-md bg-white border border-black/15 text-sm font-medium hover:bg-black/5 disabled:opacity-40"
        >
          Rendre tout le PDF recherchable ({numPages} pages)
        </button>
        <button
          onClick={makeEditable}
          disabled={busy}
          className="w-full px-3 py-2 rounded-md bg-white border border-olive/40 text-sm font-medium hover:bg-olive/10 disabled:opacity-40 text-left"
          title="Crée un calque texte éditable sur chaque page — qualité du rendu peut être altérée"
        >
          <div className="font-medium">Rendre le texte modifiable</div>
          <div className="text-[10px] text-black/50 mt-0.5">
            Texte éditable par-dessus chaque page · peut altérer le rendu
          </div>
        </button>
        <button
          disabled
          title="Bientôt — nécessite une clé API Google Cloud Vision personnelle"
          className="w-full px-3 py-2 rounded-md border border-dashed border-black/15 text-xs text-black/40 cursor-not-allowed"
        >
          Améliorer avec Google Vision (bientôt)
        </button>
      </div>

      {zoneResult !== null && (
        <div className="px-4 py-3 border-b border-black/5 bg-olive/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-black/70">Résultat zone OCR</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(zoneResult)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
              className="text-xs text-pretto hover:underline"
            >
              {copied ? 'Copié ✓' : 'Copier'}
            </button>
            <button onClick={onClearZoneResult} className="text-xs text-black/40 hover:underline ml-2">
              Effacer
            </button>
          </div>
          <pre className="text-xs whitespace-pre-wrap font-mono bg-white p-2 rounded border border-black/5 text-ink/80 max-h-32 overflow-auto">
            {zoneResult || '(rien détecté dans la zone)'}
          </pre>
        </div>
      )}

      {busy && (
        <div className="px-4 py-3 border-b border-black/5">
          <div className="text-xs text-black/60 mb-1">{progressLabel}</div>
          <div className="h-1.5 bg-black/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-pretto transition-all"
              style={{ width: `${Math.min(100, progressPct)}%` }}
            />
          </div>
          <div className="text-[10px] text-black/40 mt-1">
            La 1ère exécution télécharge les modèles (~10 Mo, mis en cache)
          </div>
        </div>
      )}

      {error && (
        <div className="px-4 py-3 bg-red-50 text-red-700 text-sm border-b border-red-100">
          <div className="font-medium mb-1">Erreur OCR</div>
          <div className="text-xs whitespace-pre-wrap break-words">{error}</div>
        </div>
      )}

      {logs.length > 0 && (
        <details className="px-4 py-2 border-b border-black/5 text-xs">
          <summary className="cursor-pointer text-black/50 select-none">
            Logs Tesseract ({logs.length})
          </summary>
          <pre className="mt-2 max-h-28 overflow-auto bg-black/5 p-2 rounded font-mono text-[10px] text-black/70 whitespace-pre-wrap">
            {logs.join('\n')}
          </pre>
        </details>
      )}

      <div className="flex-1 overflow-auto px-4 py-3">
        {result ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-black/60">Texte détecté</span>
              <button
                onClick={copy}
                className="text-xs text-pretto hover:underline"
              >
                {copied ? 'Copié ✓' : 'Copier'}
              </button>
            </div>
            <pre className="text-xs whitespace-pre-wrap font-mono bg-cream/50 p-2 rounded border border-black/5 text-ink/80">
              {result}
            </pre>
          </>
        ) : !busy ? (
          <div className="text-xs text-black/40 text-center pt-6">
            Choisis une action ci-dessus pour démarrer l'OCR.
          </div>
        ) : null}
      </div>
    </aside>
  )
}
