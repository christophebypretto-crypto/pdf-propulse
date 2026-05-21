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
  onSelectionChange: (s: Set<number>) => void
  onReorder: (newOrder: number[]) => void
  onContextAction: (
    action: 'rotate-cw' | 'rotate-ccw' | 'delete' | 'insertAfter',
    indices: number[]
  ) => void
}

export default function ThumbnailStrip({
  pages,
  currentPage,
  selected,
  onSelect,
  onSelectionChange,
  onReorder,
  onContextAction
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
    <aside className="w-44 shrink-0 bg-white border-r border-black/10 flex flex-col">
      <div className="px-3 py-2 text-xs font-medium text-black/50 border-b border-black/5">
        {pages.length} page{pages.length > 1 ? 's' : ''}
      </div>
      <div
        className="flex-1 overflow-y-auto py-2"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onSelectionChange(new Set())
            setMenu(null)
          }
        }}
      >
        {pages.map((p, i) => {
          const isSel = selected.has(i)
          const isCur = i === currentPage
          const isDropTarget = dropIdx === i && draggingIdx !== i
          return (
            <div
              key={`${p.srcIndex}-${i}`}
              className="px-3 py-1.5 flex flex-col items-center"
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
                onDoubleClick={() => onSelect(i)}
                className={[
                  'page-thumb relative w-full',
                  isCur ? 'ring-2 ring-pretto shadow-md' : isSel ? 'selected' : '',
                  draggingIdx === i ? 'dragging' : '',
                  isDropTarget ? 'ring-2 ring-olive ring-offset-2' : ''
                ].join(' ')}
                style={{ aspectRatio: `${p.width} / ${p.height}` }}
              >
                <img
                  src={p.dataUrl}
                  alt={`Page ${i + 1}`}
                  className="w-full h-full object-contain rounded-md"
                  draggable={false}
                />
                <div className="absolute top-0.5 left-0.5 bg-black/70 text-white text-[9px] font-medium px-1 py-0.5 rounded">
                  {i + 1}
                </div>
              </div>
              <div className="text-[10px] text-black/40 mt-1">Page {i + 1}</div>
            </div>
          )
        })}
      </div>

      {menu &&
        (() => {
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
    </aside>
  )
}
