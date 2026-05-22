export type AnnotationAction =
  | 'copy'
  | 'cut'
  | 'paste'
  | 'duplicate'
  | 'remove'
  | 'rotate-cw'
  | 'rotate-ccw'

interface Props {
  x: number
  y: number
  canPaste: boolean
  onAction: (a: AnnotationAction) => void
  onClose: () => void
}

const items: {
  id: AnnotationAction
  label: string
  shortcut: string
  destructive?: boolean
  needsClipboard?: boolean
  separator?: boolean
}[] = [
  { id: 'copy', label: 'Copier', shortcut: '⌘C' },
  { id: 'cut', label: 'Couper', shortcut: '⌘X' },
  { id: 'paste', label: 'Coller', shortcut: '⌘V', needsClipboard: true },
  { id: 'duplicate', label: 'Dupliquer', shortcut: '⌘D' },
  { id: 'rotate-cw', label: 'Pivoter 90° (horaire)', shortcut: '↻', separator: true },
  { id: 'rotate-ccw', label: 'Pivoter 90° (anti-horaire)', shortcut: '↺' },
  { id: 'remove', label: 'Supprimer', shortcut: '⌫', destructive: true, separator: true }
]

export default function AnnotationContextMenu({
  x,
  y,
  canPaste,
  onAction,
  onClose
}: Props): JSX.Element {
  return (
    <>
      <div
        className="fixed inset-0 z-[100]"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
        onMouseDown={onClose}
      />
      <div
        className="fixed z-[101] bg-white shadow-2xl rounded-md border border-black/15 py-1 text-sm min-w-[190px] overflow-hidden"
        style={{ left: x, top: y }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {items.map((it) => {
          const disabled = it.needsClipboard && !canPaste
          return (
            <div key={it.id}>
              {it.separator && <div className="my-0.5 border-t border-black/10" />}
              <button
                disabled={disabled}
                onClick={() => {
                  if (disabled) return
                  onAction(it.id)
                  onClose()
                }}
                className={[
                  'flex items-center justify-between w-full text-left px-3 py-1.5 transition-colors',
                  disabled
                    ? 'text-black/30 cursor-not-allowed'
                    : it.destructive
                      ? 'text-red-600 hover:bg-red-500 hover:text-white'
                      : 'text-ink hover:bg-pretto hover:text-white'
                ].join(' ')}
              >
                <span>{it.label}</span>
                <span className="text-xs opacity-60 ml-4 font-mono">{it.shortcut}</span>
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}
