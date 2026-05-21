import { useEffect, useState } from 'react'
import Dialog from './Dialog'
import { findTextOccurrences, removeTextFromPdf } from '../../lib/textRemoval'

interface Props {
  pdfBytes: ArrayBuffer
  onClose: () => void
  onDone: (newBytes: ArrayBuffer, removedCount: number) => void
}

export default function RemoveTextDialog({ pdfBytes, onClose, onDone }: Props): JSX.Element {
  const [text, setText] = useState('BROUILLON')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewPages, setPreviewPages] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-preview à chaque changement de texte
  useEffect(() => {
    let cancelled = false
    if (!text.trim()) {
      setPreviewCount(null)
      return
    }
    const handle = setTimeout(async () => {
      try {
        const r = await findTextOccurrences(pdfBytes, text, { caseSensitive })
        if (!cancelled) {
          setPreviewCount(r.count)
          setPreviewPages(r.pagesAffected)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur de recherche')
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [text, caseSensitive, pdfBytes])

  async function doRemove() {
    if (!text.trim()) return
    setBusy(true)
    setError(null)
    try {
      const r = await removeTextFromPdf(pdfBytes, text, { caseSensitive })
      onDone(r.bytes, r.removedCount)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="Supprimer un texte récurrent (watermark, mention…)"
      onClose={onClose}
      width={560}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-md hover:bg-black/5 text-black/70">
            Annuler
          </button>
          <button
            onClick={doRemove}
            disabled={busy || !text.trim() || previewCount === 0}
            className="px-4 py-2 rounded-md bg-pretto text-white font-medium disabled:opacity-40 hover:bg-pretto/90"
          >
            {busy
              ? 'Suppression…'
              : previewCount && previewCount > 0
                ? `Supprimer ${previewCount} occurrence${previewCount > 1 ? 's' : ''}`
                : 'Supprimer'}
          </button>
        </>
      }
    >
      <p className="text-sm text-black/60 mb-3">
        Cherche le texte dans tout le PDF et recouvre chaque occurrence avec un rectangle blanc opaque (en
        respectant la rotation du texte). Idéal pour effacer des watermarks comme <strong>BROUILLON</strong>,{' '}
        <strong>DRAFT</strong>, <strong>COPY</strong>, ou des mentions répétées.
      </p>
      <label className="block text-sm font-medium mb-1">Texte à supprimer</label>
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ex : BROUILLON"
        className="w-full px-3 py-2 border border-black/15 rounded-md font-mono focus:outline-none focus:border-pretto"
      />
      <label className="flex items-center gap-2 mt-3 text-sm text-black/70">
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(e) => setCaseSensitive(e.target.checked)}
          className="accent-pretto"
        />
        Respecter la casse (sinon BROUILLON et brouillon sont équivalents)
      </label>
      {previewCount !== null && (
        <div
          className={[
            'mt-4 p-3 rounded-md text-sm',
            previewCount === 0
              ? 'bg-black/5 text-black/60'
              : 'bg-pretto/10 text-pretto border border-pretto/20'
          ].join(' ')}
        >
          {previewCount === 0 ? (
            <span>Aucune occurrence trouvée.</span>
          ) : (
            <>
              <strong>{previewCount} occurrence{previewCount > 1 ? 's' : ''}</strong> trouvée
              {previewCount > 1 ? 's' : ''} sur{' '}
              <strong>{previewPages.length} page{previewPages.length > 1 ? 's' : ''}</strong>
              {previewPages.length <= 10 && (
                <> (page{previewPages.length > 1 ? 's' : ''} {previewPages.map((p) => p + 1).join(', ')})</>
              )}
              .
            </>
          )}
        </div>
      )}
      {error && (
        <div className="mt-3 p-3 rounded-md bg-red-50 text-red-700 text-sm">{error}</div>
      )}
      <p className="text-xs text-black/40 mt-4">
        ⚠️ Note : pour un watermark superposé au contenu, le rectangle blanc recouvre uniquement la zone du
        texte du watermark — donc le contenu légitime autour reste intact. Aux endroits où le texte du
        watermark chevauche du contenu, ce contenu sera caché aussi (c'est inhérent à la nature des
        watermarks).
      </p>
    </Dialog>
  )
}
