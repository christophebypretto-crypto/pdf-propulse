import { useState } from 'react'
import Dialog from './Dialog'
import { parseRanges } from '../../lib/ranges'

type Mode = 'each' | 'ranges' | 'everyN'

interface Props {
  totalPages: number
  pdfBytes: ArrayBuffer
  onClose: () => void
  onDone: () => void
}

export default function SplitDialog({ totalPages, pdfBytes, onClose, onDone }: Props): JSX.Element {
  const [mode, setMode] = useState<Mode>('ranges')
  const [rangeText, setRangeText] = useState('1-' + Math.ceil(totalPages / 2) + ', ' + (Math.ceil(totalPages / 2) + 1) + '-' + totalPages)
  const [n, setN] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function doSplit() {
    setError(null)
    let ranges: { from: number; to: number }[] | null = []

    if (mode === 'each') {
      for (let i = 0; i < totalPages; i++) ranges.push({ from: i, to: i })
    } else if (mode === 'everyN') {
      if (n < 1) {
        setError('Saisis un nombre entier supérieur ou égal à 1.')
        return
      }
      for (let i = 0; i < totalPages; i += n) {
        ranges.push({ from: i, to: Math.min(i + n - 1, totalPages - 1) })
      }
    } else {
      ranges = parseRanges(rangeText, totalPages)
      if (!ranges) {
        setError('Format invalide. Exemple : 1-3, 5, 7-9 (pages 1 à 3, 5, puis 7 à 9).')
        return
      }
    }

    if (ranges.length === 0) {
      setError('Aucune plage à exporter.')
      return
    }

    const dir = await window.api.savePdf('partie.pdf')
    if (!dir) return

    setBusy(true)
    try {
      const results = await window.api.pdfSplit(pdfBytes, ranges)
      // Sauvegarde chaque fichier avec un suffixe
      const base = dir.replace(/\.pdf$/i, '')
      for (let i = 0; i < results.length; i++) {
        await window.api.writePdf(`${base}-${i + 1}.pdf`, results[i])
      }
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const radio = (key: Mode, label: string, hint: string) => (
    <label className="flex items-start gap-2 cursor-pointer p-2 rounded hover:bg-black/[0.03]">
      <input
        type="radio"
        name="mode"
        checked={mode === key}
        onChange={() => setMode(key)}
        className="mt-1 accent-pretto"
      />
      <div>
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-black/50">{hint}</div>
      </div>
    </label>
  )

  return (
    <Dialog
      title="Diviser le PDF"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-md hover:bg-black/5 text-black/70">
            Annuler
          </button>
          <button
            onClick={doSplit}
            disabled={busy}
            className="px-4 py-2 rounded-md bg-pretto text-white font-medium disabled:opacity-40 hover:bg-pretto/90"
          >
            {busy ? 'Division…' : 'Diviser'}
          </button>
        </>
      }
    >
      <p className="text-sm text-black/60 mb-2">
        Document de <strong>{totalPages}</strong> page{totalPages > 1 ? 's' : ''}.
      </p>
      <div className="space-y-1">
        {radio('ranges', 'Plages personnalisées', 'Une plage = un fichier de sortie')}
        {mode === 'ranges' && (
          <div className="pl-7 pb-2">
            <input
              value={rangeText}
              onChange={(e) => setRangeText(e.target.value)}
              placeholder="Ex : 1-3, 5, 7-9"
              className="w-full px-3 py-2 border border-black/15 rounded-md font-mono text-sm focus:outline-none focus:border-pretto"
            />
          </div>
        )}
        {radio('each', 'Une page = un fichier', `Génère ${totalPages} fichiers`)}
        {radio('everyN', 'Toutes les N pages', 'Découpe en blocs de taille fixe')}
        {mode === 'everyN' && (
          <div className="pl-7 pb-2 flex items-center gap-2 text-sm">
            <span>Blocs de</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={n}
              onChange={(e) => setN(parseInt(e.target.value, 10) || 1)}
              className="w-20 px-2 py-1 border border-black/15 rounded-md text-center"
            />
            <span>pages</span>
          </div>
        )}
      </div>
      {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
      <p className="text-xs text-black/40 mt-4">
        Les fichiers seront enregistrés en suivant le nom choisi avec un suffixe -1, -2, etc.
      </p>
    </Dialog>
  )
}
