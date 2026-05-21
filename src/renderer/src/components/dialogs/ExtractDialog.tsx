import { useState } from 'react'
import Dialog from './Dialog'
import { parseRanges, rangesToIndices } from '../../lib/ranges'

interface Props {
  totalPages: number
  pdfBytes: ArrayBuffer
  selected: Set<number>
  onClose: () => void
  onDone: () => void
}

export default function ExtractDialog({
  totalPages,
  pdfBytes,
  selected,
  onClose,
  onDone
}: Props): JSX.Element {
  const initial =
    selected.size > 0
      ? Array.from(selected)
          .sort((a, b) => a - b)
          .map((i) => i + 1)
          .join(', ')
      : `1-${totalPages}`
  const [rangeText, setRangeText] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function doExtract() {
    setError(null)
    const ranges = parseRanges(rangeText, totalPages)
    if (!ranges) {
      setError('Format invalide. Exemple : 1-3, 5, 7-9')
      return
    }
    const indices = rangesToIndices(ranges)
    if (indices.length === 0) {
      setError('Aucune page à extraire.')
      return
    }
    const path = await window.api.savePdf('extrait.pdf')
    if (!path) return
    setBusy(true)
    try {
      const bytes = await window.api.pdfExtract(pdfBytes, indices)
      await window.api.writePdf(path, bytes)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="Extraire des pages"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-md hover:bg-black/5 text-black/70">
            Annuler
          </button>
          <button
            onClick={doExtract}
            disabled={busy}
            className="px-4 py-2 rounded-md bg-pretto text-white font-medium disabled:opacity-40 hover:bg-pretto/90"
          >
            {busy ? 'Extraction…' : 'Extraire'}
          </button>
        </>
      }
    >
      <p className="text-sm text-black/60 mb-2">
        Document de <strong>{totalPages}</strong> page{totalPages > 1 ? 's' : ''}.
        {selected.size > 0 && (
          <> Pages présélectionnées : <strong>{selected.size}</strong>.</>
        )}
      </p>
      <label className="block text-sm font-medium mb-1">Pages à extraire</label>
      <input
        value={rangeText}
        onChange={(e) => setRangeText(e.target.value)}
        placeholder="Ex : 1-3, 5, 7-9"
        className="w-full px-3 py-2 border border-black/15 rounded-md font-mono text-sm focus:outline-none focus:border-pretto"
      />
      {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
      <p className="text-xs text-black/40 mt-3">
        Les pages sélectionnées seront enregistrées dans un nouveau PDF.
      </p>
    </Dialog>
  )
}
