interface Props {
  onOpen: () => void
  onNew: () => void
  onMerge: () => void
  recentFiles: string[]
  onOpenRecent: (path: string) => void
}

function baseName(p: string): string {
  return p.split(/[/\\]/).pop() || p
}

function parentDir(p: string): string {
  const parts = p.split(/[/\\]/)
  parts.pop()
  return parts.join('/')
}

export default function EmptyState({
  onOpen,
  onNew,
  onMerge,
  recentFiles,
  onOpenRecent
}: Props): JSX.Element {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-4 text-center p-8 overflow-auto">
      <div className="text-6xl text-pretto/30 select-none">PDF</div>
      <h1 className="text-2xl font-semibold text-ink">PDF 100K</h1>
      <p className="text-black/60 max-w-md">
        Outil interne d'édition PDF pour l'équipe Pretto Galaxie. Démarre un nouveau document,
        ouvre un PDF existant, ou reprends un fichier récent.
      </p>
      <div className="flex flex-wrap gap-3 mt-2 justify-center">
        <button
          onClick={onNew}
          className="px-5 py-2.5 rounded-md bg-pretto text-white font-medium hover:bg-pretto/90"
        >
          ＋ Nouveau
        </button>
        <button
          onClick={onOpen}
          className="px-5 py-2.5 rounded-md bg-white border border-black/15 font-medium hover:bg-black/5"
        >
          Ouvrir un PDF
        </button>
        <button
          onClick={onMerge}
          className="px-5 py-2.5 rounded-md bg-white border border-black/15 font-medium hover:bg-black/5"
        >
          Fusionner plusieurs PDFs
        </button>
      </div>

      {recentFiles.length > 0 && (
        <div className="mt-6 w-full max-w-md text-left">
          <div className="text-xs font-semibold uppercase tracking-wide text-black/40 mb-2 px-1">
            Fichiers récents
          </div>
          <ul className="bg-white border border-black/10 rounded-lg divide-y divide-black/5 overflow-hidden">
            {recentFiles.slice(0, 8).map((p) => (
              <li key={p}>
                <button
                  onClick={() => onOpenRecent(p)}
                  title={p}
                  className="w-full text-left px-3 py-2 hover:bg-pretto/5 flex flex-col"
                >
                  <span className="text-sm text-ink truncate">{baseName(p)}</span>
                  <span className="text-[11px] text-black/40 truncate">{parentDir(p)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-black/40 mt-6">
        Raccourcis : ⌘N nouveau · ⌘O ouvrir · ⌘S enregistrer · ⌫ supprimer
      </p>
    </div>
  )
}
