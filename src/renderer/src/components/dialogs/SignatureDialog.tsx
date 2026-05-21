import { useEffect, useRef, useState } from 'react'
import Dialog from './Dialog'

interface Props {
  onClose: () => void
  onDone: (dataUrl: string) => void
}

type Mode = 'draw' | 'import' | 'type'

export default function SignatureDialog({ onClose, onDone }: Props): JSX.Element {
  const [mode, setMode] = useState<Mode>('draw')
  const [typed, setTyped] = useState('')
  const [imageData, setImageData] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (mode !== 'draw') return
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.strokeStyle = '#1A1A1A'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [mode])

  function pos(e: React.MouseEvent | React.TouchEvent) {
    const c = canvasRef.current!
    const rect = c.getBoundingClientRect()
    const t = 'touches' in e ? e.touches[0] : (e as React.MouseEvent)
    return {
      x: ((t.clientX - rect.left) / rect.width) * c.width,
      y: ((t.clientY - rect.top) / rect.height) * c.height
    }
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    drawing.current = true
    last.current = pos(e)
  }
  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return
    const c = canvasRef.current!
    const ctx = c.getContext('2d')!
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(last.current!.x, last.current!.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }
  function end() {
    drawing.current = false
    last.current = null
  }

  function clearCanvas() {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, c.width, c.height)
  }

  async function importImage(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      setImageData(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  function buildTypedSignature(): string {
    const c = document.createElement('canvas')
    c.width = 600
    c.height = 150
    const ctx = c.getContext('2d')!
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.fillStyle = '#1A1A1A'
    ctx.font = '64px "Snell Roundhand", "Apple Chancery", "Brush Script MT", cursive'
    ctx.textBaseline = 'middle'
    ctx.fillText(typed, 20, c.height / 2)
    return c.toDataURL('image/png')
  }

  function commit() {
    if (mode === 'draw') {
      if (!canvasRef.current) return
      onDone(canvasRef.current.toDataURL('image/png'))
    } else if (mode === 'import') {
      if (!imageData) return
      onDone(imageData)
    } else if (mode === 'type') {
      if (!typed.trim()) return
      onDone(buildTypedSignature())
    }
  }

  const tabBtn = (m: Mode, label: string) => (
    <button
      onClick={() => setMode(m)}
      className={[
        'px-3 py-1.5 rounded-md text-sm font-medium',
        mode === m ? 'bg-pretto text-white' : 'text-black/70 hover:bg-black/5'
      ].join(' ')}
    >
      {label}
    </button>
  )

  return (
    <Dialog
      title="Créer une signature"
      onClose={onClose}
      width={640}
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-md hover:bg-black/5 text-black/70">
            Annuler
          </button>
          {mode === 'draw' && (
            <button
              onClick={clearCanvas}
              className="px-4 py-2 rounded-md hover:bg-black/5 text-black/70"
            >
              Effacer
            </button>
          )}
          <button
            onClick={commit}
            disabled={mode === 'import' ? !imageData : mode === 'type' ? !typed.trim() : false}
            className="px-4 py-2 rounded-md bg-pretto text-white font-medium disabled:opacity-40 hover:bg-pretto/90"
          >
            Utiliser cette signature
          </button>
        </>
      }
    >
      <div className="flex gap-2 mb-4">
        {tabBtn('draw', 'Dessiner')}
        {tabBtn('import', 'Importer une image')}
        {tabBtn('type', 'Taper le nom')}
      </div>

      {mode === 'draw' && (
        <div>
          <canvas
            ref={canvasRef}
            width={600}
            height={200}
            className="block w-full border-2 border-dashed border-black/20 rounded-md bg-white cursor-crosshair"
            onMouseDown={start}
            onMouseMove={move}
            onMouseUp={end}
            onMouseLeave={end}
            onTouchStart={start}
            onTouchMove={move}
            onTouchEnd={end}
          />
          <p className="text-xs text-black/50 mt-2">Dessine ta signature ci-dessus avec la souris ou le trackpad.</p>
        </div>
      )}

      {mode === 'import' && (
        <div>
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importImage(f)
            }}
            className="block w-full text-sm"
          />
          {imageData && (
            <div className="mt-3 p-3 border border-black/10 rounded-md bg-white">
              <img src={imageData} alt="Signature" className="max-h-32 mx-auto" />
            </div>
          )}
          <p className="text-xs text-black/50 mt-2">
            Astuce : prends une photo de ta signature sur fond blanc, ou exporte-la depuis un autre outil.
          </p>
        </div>
      )}

      {mode === 'type' && (
        <div>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Christophe Goubet"
            className="w-full px-3 py-2 border border-black/15 rounded-md focus:outline-none focus:border-pretto"
          />
          {typed.trim() && (
            <div className="mt-3 p-4 border border-black/10 rounded-md bg-white text-center">
              <span style={{ fontFamily: '"Snell Roundhand", "Apple Chancery", "Brush Script MT", cursive', fontSize: 48 }}>
                {typed}
              </span>
            </div>
          )}
          <p className="text-xs text-black/50 mt-2">Police cursive automatique. Utile pour signatures rapides.</p>
        </div>
      )}
    </Dialog>
  )
}
