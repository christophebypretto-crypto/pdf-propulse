import { useState, useRef } from 'react'

export interface PageEntry {
  srcIndex: number
  dataUrl: string
  width: number
  height: number
}

interface Props {
  pages: PageEntry[]
  currentPage: number
  selected: Set<number>
  onSelect: (i: number) => void
  onOpenPage: (i: number) => void
  onSelectionChange: (s: Set<number>) => void
  onReorder: (newOrder: number[]) => void
  onContextAction: (
    action: 'rotate-cw' | 'rotate-ccw' | 'delete' | 'insertAfter',
    indices: number[]
  ) => void
  onAppendPdf: () => void
}

export default function ThumbnailGrid({
  pages,
  currentPage,
  selected,
  onSelect,
  onOpenPage,
  onSelectionChange,
  onReorder,
  onContextAction,
  onAppendPdf
}: Props): JSX.Element {
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ i: number; x: number; y: number } | null>(null)
  const lastClicked = useRef<number | null>(null)

  function handleClick(i: number, e: React.MouseEvent) {
    onSelect(i)
    const next = new Set(selected)
    if (e.shiftKey && lastClicked.current !== null) {
      const [a, b] = [lastClicked.current, i].sort((x, y) => x - y)
      next.clear()
      for (let k = a; k <= b; k++) next.add(k)
    } else if (e.metaKey || e.ctrlKey) {
      if (next.has(i)) next.delete(i)
      else next.add(i)
    } else {
      next.clear()
      next.add(i)
    }
    lastClicked.current = i
    onSelectionChange(next)
  }

  return (
    <div
      className="h-full w-full overflow-auto p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onSelectionChange(new Set())
          setMenu(null)
        }
      }}
    >
      <div className="text-xs text-black/50 mb-3 flex items-center gap-2 flex-wrap">
        <span>
          {pages.length} page{pages.length > 1 ? 's' : ''}
          {selected.size > 0 && (
            <strong className="ml-1 text-pretto">· {selected.size} sélectionnée{selected.size > 1 ? 's' : ''}</strong>
          )}
        </span>
        <span className="text-black/30">·</span>
        <span><kbd className="px-1 py-0.5 bg-black/5 rounded text-[10px]">Clic</kbd> sélectionner</span>
        <span><kbd className="px-1 py-0.5 bg-black/5 rounded text-[10px]">⇧+Clic</kbd> étendre</span>
        <span><kbd className="px-1 py-0.5 bg-black/5 rounded text-[10px]">⌘+Clic</kbd> ajouter/retirer</span>
        <span><kbd className="px-1 py-0.5 bg-black/5 rounded text-[10px]">Double-clic</kbd> ouvrir</span>
        <span><kbd className="px-1 py-0.5 bg-black/5 rounded text-[10px]">Clic-droit</kbd> menu</span>
      </div>
      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, 200px)' }}>
        {pages.map((p, i) => {
          const isSel = selected.has(i)
          const isCur = i === currentPage
          const isDropTarget = dropIdx === i && draggingIdx !== i
          return (
            <div
              key={`${p.srcIndex}-${i}`}
              className="flex flex-col items-center gap-1"
              draggable
              onDragStart={() => setDraggingIdx(i)}
              onDragOver={(e) => {
                e.preventDefault()
                setDropIdx(i)
              }}
              onDragEnd={() => {
                if (
                  draggingIdx !== null &&
                  dropIdx !== null &&
                  draggingIdx !== dropIdx
                ) {
                  const order = pages.map((_, idx) => idx)
                  const [moved] = order.splice(draggingIdx, 1)
                  order.splice(dropIdx, 0, moved)
                  onReorder(order)
                }
                setDraggingIdx(null)
                setDropIdx(null)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ i, x: e.clientX, y: e.clientY })
              }}
            >
              <div
                onClick={(e) => handleClick(i, e)}
                onDoubleClick={() => onOpenPage(i)}
                className={[
                  'page-thumb relative',
                  isSel ? 'selected' : '',
                  isCur ? 'ring-2 ring-pretto ring-offset-2 shadow-md' : '',
                  draggingIdx === i ? 'dragging' : '',
                  isDropTarget ? 'ring-2 ring-olive ring-offset-2' : ''
                ].join(' ')}
                style={{
                  width: 200,
                  height: (200 * p.height) / p.width
                }}
              >
                <img
                  src={p.dataUrl}
                  alt={`Page ${i + 1}`}
                  className="w-full h-full object-contain rounded-md"
                  draggable={false}
                />
                <div className="absolute top-1 left-1 bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                  {i + 1}
                </div>
              </div>
              <div className="text-xs text-black/50">Page {i + 1}</div>
            </div>
          )
        })}

        {/* Tuile "Ajouter PDF" à la suite */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={onAppendPdf}
            className="page-thumb flex flex-col items-center justify-center gap-2 border-2 border-dashed border-black/20 hover:border-pretto hover:bg-pretto/5 text-black/40 hover:text-pretto transition-colors"
            style={{
              width: 200,
              height: pages.length > 0 ? (200 * pages[0].height) / pages[0].width : 280
            }}
            title="Ajouter un PDF à la suite"
          >
            <span className="text-4xl leading-none">+</span>
            <span className="text-xs font-medium">Ajouter PDF</span>
          </button>
          <div className="text-xs text-black/40">à la suite</div>
        </div>
      </div>

      {menu &&
        (() => {
          // Determine target: bulk if the clicked page is in a multi-selection,
          // otherwise single page.
          const isBulk = selected.has(menu.i) && selected.size > 1
          const targetIndices = isBulk ? Array.from(selected).sort((a, b) => a - b) : [menu.i]
          const n = targetIndices.length
          const items: {
            id: 'rotate-cw' | 'rotate-ccw' | 'insertAfter' | 'delete'
            label: string
            disabled?: boolean
          }[] = [
            {
              id: 'rotate-cw',
              label: isBulk ? `Pivoter ${n} pages 90° (horaire)` : 'Pivoter 90° (horaire)'
            },
            {
              id: 'rotate-ccw',
              label: isBulk
                ? `Pivoter ${n} pages 90° (anti-horaire)`
                : 'Pivoter 90° (anti-horaire)'
            },
            // Insert ne marche que pour une seule page (ambiguïté de position en bulk)
            {
              id: 'insertAfter',
              label: 'Insérer un PDF après cette page…',
              disabled: isBulk
            },
            {
              id: 'delete',
              label: isBulk ? `Supprimer ${n} pages sélectionnées` : 'Supprimer cette page'
            }
          ]
          return (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenu(null)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenu(null)
                }}
              />
              <div
                className="fixed z-50 bg-white shadow-xl rounded-md border border-black/10 py-1 text-sm min-w-[260px]"
                style={{ left: menu.x, top: menu.y }}
              >
                {isBulk && (
                  <div className="px-3 py-1.5 text-[11px] text-pretto font-medium border-b border-black/5 bg-pretto/5">
                    {n} pages sélectionnées
                  </div>
                )}
                {items.map((opt) => (
                  <button
                    key={opt.id}
                    disabled={opt.disabled}
                    onClick={() => {
                      if (opt.disabled) return
                      onContextAction(opt.id, targetIndices)
                      setMenu(null)
                    }}
                    className={[
                      'block w-full text-left px-3 py-1.5',
                      opt.disabled
                        ? 'text-black/30 cursor-not-allowed'
                        : opt.id === 'delete'
                          ? 'text-red-600 hover:bg-red-500 hover:text-white'
                          : 'hover:bg-pretto hover:text-white'
                    ].join(' ')}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )
        })()}
    </div>
  )
}
