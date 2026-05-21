import { useState } from 'react'
import Dialog from './Dialog'

interface FileEntry {
  path: string
  name: string
  size: number
}

interface Props {
  onClose: () => void
  onDone: (mergedBytes: ArrayBuffer) => void | Promise<void>
}

export default function MergeDialog({ onClose, onDone }: Props): JSX.Element {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [busy, setBusy] = useState(false)

  async function addFiles() {
    const paths = await window.api.openPdf(true)
    if (!paths) return
    const entries: FileEntry[] = paths.map((p) => ({
      path: p,
      name: p.split('/').pop() || p,
      size: 0
    }))
    setFiles((prev) => [...prev, ...entries])
  }

  function move(i: number, dir: -1 | 1) {
    const next = [...files]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    setFiles(next)
  }

  function remove(i: number) {
    setFiles(files.filter((_, k) => k !== i))
  }

  async function doMerge() {
    if (files.length < 2) return
    setBusy(true)
    try {
      const buffers: ArrayBuffer[] = []
      for (const f of files) buffers.push(await window.api.readPdf(f.path))
      const out = await window.api.pdfMerge(buffers)
      await onDone(out)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title="Fusionner des PDFs"
      onClose={onClose}
      width={620}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md hover:bg-black/5 text-black/70"
          >
            Annuler
          </button>
          <button
            onClick={doMerge}
            disabled={files.length < 2 || busy}
            className="px-4 py-2 rounded-md bg-pretto text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-pretto/90"
          >
            {busy ? 'Fusion…' : `Fusionner ${files.length} fichiers`}
          </button>
        </>
      }
    >
      <p className="text-sm text-black/60 mb-3">
        Ajoute au moins 2 PDFs. L'ordre de la liste détermine l'ordre dans le fichier final.
      </p>
      <button
        onClick={addFiles}
        className="w-full py-3 rounded-md border-2 border-dashed border-black/20 hover:border-pretto hover:text-pretto text-black/60 text-sm font-medium mb-4"
      >
        + Ajouter des PDFs
      </button>
      <ul className="space-y-1">
        {files.map((f, i) => (
          <li
            key={i}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-black/[0.03] hover:bg-black/[0.05]"
          >
            <span className="text-xs text-black/40 w-6">{i + 1}.</span>
            <span className="flex-1 truncate text-sm">{f.name}</span>
            <button
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="w-7 h-7 rounded hover:bg-black/10 disabled:opacity-30"
              title="Monter"
            >
              ↑
            </button>
            <button
              onClick={() => move(i, 1)}
              disabled={i === files.length - 1}
              className="w-7 h-7 rounded hover:bg-black/10 disabled:opacity-30"
              title="Descendre"
            >
              ↓
            </button>
            <button
              onClick={() => remove(i)}
              className="w-7 h-7 rounded hover:bg-red-50 text-red-500"
              title="Retirer"
            >
              ✕
            </button>
          </li>
        ))}
        {files.length === 0 && (
          <li className="text-center text-sm text-black/40 py-4">Aucun fichier ajouté</li>
        )}
      </ul>
    </Dialog>
  )
}
