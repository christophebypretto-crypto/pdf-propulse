interface Props {
  onOpen: () => void
  onMerge: () => void
}

export default function EmptyState({ onOpen, onMerge }: Props): JSX.Element {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-4 text-center p-8">
      <div className="text-6xl text-pretto/30 select-none">PDF</div>
      <h1 className="text-2xl font-semibold text-ink">Team 100K PDF</h1>
      <p className="text-black/60 max-w-md">
        Outil interne d'édition PDF pour l'équipe Pretto Galaxie. Ouvre un document pour
        réorganiser les pages, ou démarre directement par une fusion.
      </p>
      <div className="flex gap-3 mt-2">
        <button
          onClick={onOpen}
          className="px-5 py-2.5 rounded-md bg-pretto text-white font-medium hover:bg-pretto/90"
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
      <p className="text-xs text-black/40 mt-6">
        Raccourcis : ⌘O ouvrir · ⌘S enregistrer · ⌘A tout sélectionner · ⌫ supprimer
      </p>
    </div>
  )
}
