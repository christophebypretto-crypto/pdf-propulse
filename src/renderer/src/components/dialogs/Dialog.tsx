import { ReactNode, useEffect } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}

export default function Dialog({ title, onClose, children, footer, width = 560 }: Props): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl flex flex-col max-h-[85vh]"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-black/10 flex items-center justify-between">
          <h2 className="font-semibold text-lg">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md hover:bg-black/5 text-black/50"
            aria-label="Fermer"
          >
            ✕
          </button>
        </header>
        <div className="px-5 py-4 overflow-auto flex-1">{children}</div>
        {footer && (
          <footer className="px-5 py-3 border-t border-black/10 flex justify-end gap-2">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
