import { useCallback, useEffect, useState } from 'react'
import Sidebar, { Tool } from './components/Sidebar'
import Toolbar from './components/Toolbar'
import ThumbnailStrip, { PageEntry } from './components/ThumbnailStrip'
import ThumbnailGrid from './components/ThumbnailGrid'
import PageViewer from './components/PageViewer'
import EmptyState from './components/EmptyState'
import OCRPanel from './components/OCRPanel'
import MergeDialog from './components/dialogs/MergeDialog'
import SplitDialog from './components/dialogs/SplitDialog'
import ExtractDialog from './components/dialogs/ExtractDialog'
import SignatureDialog from './components/dialogs/SignatureDialog'
import { renderPagesToThumbnails } from './lib/pdfRender'
import { Annotation, applyAnnotationsToPdf } from './lib/annotations'
import { FormField, applyFormFieldsToPdf } from './lib/forms'
import { ocrOnZone } from './lib/searchable'

export default function App(): JSX.Element {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null)
  const [pages, setPages] = useState<PageEntry[]>([])
  const [currentPage, setCurrentPage] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [tool, setTool] = useState<Tool>('pages')
  const [scale, setScale] = useState(1.2)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [formFields, setFormFields] = useState<FormField[]>([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<
    null | 'merge' | 'split' | 'extract' | 'signature'
  >(null)

  // Options des outils
  const [highlightColor, setHighlightColor] = useState('#FFF200')
  const [highlightOpacity, setHighlightOpacity] = useState(0.35)
  const [highlightMode, setHighlightMode] = useState<'shape' | 'text'>('text')
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [clipboardAnnotation, setClipboardAnnotation] = useState<Annotation | null>(null)
  const [ocrZoneActive, setOcrZoneActive] = useState(false)
  const [ocrZoneResult, setOcrZoneResult] = useState<string | null>(null)
  const [penColor, setPenColor] = useState('#1A1A1A')
  const [penWidth, setPenWidth] = useState(3)
  const [textSize, setTextSize] = useState(14)
  const [textColor, setTextColor] = useState('#1A1A1A')
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)

  const loadFromPath = useCallback(async (path: string) => {
    setBusy(true)
    try {
      const buf = await window.api.readPdf(path)
      const thumbs = await renderPagesToThumbnails(buf)
      setFilePath(path)
      setPdfBytes(buf)
      setPages(thumbs)
      setCurrentPage(0)
      setSelected(new Set([0]))
      setAnnotations([])
      setFormFields([])
      setDirty(false)
    } finally {
      setBusy(false)
    }
  }, [])

  const loadFromBytes = useCallback(
    async (buf: ArrayBuffer, newName?: string) => {
      setBusy(true)
      try {
        const thumbs = await renderPagesToThumbnails(buf)
        setPdfBytes(buf)
        setPages(thumbs)
        setCurrentPage(0)
        setSelected(new Set([0]))
        setAnnotations([])
        setFormFields([])
        setDirty(true)
        if (newName) setFilePath(newName)
      } finally {
        setBusy(false)
      }
    },
    []
  )

  const openFile = useCallback(async () => {
    const paths = await window.api.openPdf(false)
    if (!paths || paths.length === 0) return
    await loadFromPath(paths[0])
  }, [loadFromPath])

  const buildFinalPdf = useCallback(async (): Promise<ArrayBuffer | null> => {
    if (!pdfBytes) return null
    let out = pdfBytes
    if (annotations.length > 0) {
      out = await applyAnnotationsToPdf(out, annotations)
    }
    if (formFields.length > 0) {
      out = await applyFormFieldsToPdf(out, formFields)
    }
    return out
  }, [pdfBytes, annotations, formFields])

  const save = useCallback(async () => {
    if (!pdfBytes) return
    let path = filePath
    const final = await buildFinalPdf()
    if (!final) return
    if (!path) {
      path = await window.api.savePdf('document.pdf')
      if (!path) return
    }
    await window.api.writePdf(path, final)
    setFilePath(path)
    setDirty(false)
    setAnnotations([])
    setFormFields([])
    setPdfBytes(final)
  }, [pdfBytes, filePath, buildFinalPdf])

  const saveAs = useCallback(async () => {
    if (!pdfBytes) return
    const final = await buildFinalPdf()
    if (!final) return
    const path = await window.api.savePdf(filePath?.split('/').pop() || 'document.pdf')
    if (!path) return
    await window.api.writePdf(path, final)
    setFilePath(path)
    setDirty(false)
    setAnnotations([])
    setFormFields([])
    setPdfBytes(final)
  }, [pdfBytes, filePath, buildFinalPdf])

  const addAnnotation = useCallback((a: Annotation) => {
    setAnnotations((prev) => [...prev, a])
    setDirty(true)
  }, [])

  const updateAnnotation = useCallback(
    (id: string, updates: Partial<Annotation>) => {
      setAnnotations((prev) =>
        prev.map((a) => (a.id === id ? ({ ...a, ...updates } as Annotation) : a))
      )
      setDirty(true)
    },
    []
  )

  const removeAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id))
    setDirty(true)
  }, [])

  const copyAnnotationById = useCallback(
    (id: string) => {
      const a = annotations.find((x) => x.id === id)
      if (a) setClipboardAnnotation(a)
    },
    [annotations]
  )

  const cutAnnotationById = useCallback(
    (id: string) => {
      const a = annotations.find((x) => x.id === id)
      if (a) {
        setClipboardAnnotation(a)
        setAnnotations((prev) => prev.filter((x) => x.id !== id))
        setSelectedAnnotationId(null)
        setDirty(true)
      }
    },
    [annotations]
  )

  const pasteAnnotation = useCallback(
    (clip: Annotation, atPage: number) => {
      const dx = 0.025
      const dy = 0.02
      const fresh = 'a_' + Math.random().toString(36).slice(2, 9)
      let copy: Annotation
      if (clip.kind === 'highlight') {
        copy = {
          ...clip,
          id: fresh,
          pageIndex: atPage,
          rect: {
            x: Math.min(1 - clip.rect.w, Math.max(0, clip.rect.x + dx)),
            y: Math.min(1 - clip.rect.h, Math.max(0, clip.rect.y + dy)),
            w: clip.rect.w,
            h: clip.rect.h
          }
        }
      } else if (clip.kind === 'text') {
        copy = {
          ...clip,
          id: fresh,
          pageIndex: atPage,
          x: Math.min(1, Math.max(0, clip.x + dx)),
          y: Math.min(1, Math.max(0, clip.y + dy))
        }
      } else if (clip.kind === 'image') {
        copy = {
          ...clip,
          id: fresh,
          pageIndex: atPage,
          x: Math.min(1 - clip.w, Math.max(0, clip.x + dx)),
          y: Math.min(1 - clip.h, Math.max(0, clip.y + dy))
        }
      } else {
        copy = {
          ...clip,
          id: fresh,
          pageIndex: atPage,
          points: clip.points.map((p) => ({ x: p.x + dx, y: p.y + dy }))
        }
      }
      setAnnotations((prev) => [...prev, copy])
      setSelectedAnnotationId(copy.id)
      setDirty(true)
    },
    []
  )

  const pasteAtCurrent = useCallback(() => {
    if (clipboardAnnotation) pasteAnnotation(clipboardAnnotation, currentPage)
  }, [clipboardAnnotation, currentPage, pasteAnnotation])

  const duplicateAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => {
      const orig = prev.find((a) => a.id === id)
      if (!orig) return prev
      const dx = 0.025
      const dy = 0.02
      let copy: Annotation
      if (orig.kind === 'highlight') {
        copy = {
          ...orig,
          id: 'a_' + Math.random().toString(36).slice(2, 9),
          rect: {
            x: Math.min(1 - orig.rect.w, orig.rect.x + dx),
            y: Math.min(1 - orig.rect.h, orig.rect.y + dy),
            w: orig.rect.w,
            h: orig.rect.h
          }
        }
      } else if (orig.kind === 'text') {
        copy = {
          ...orig,
          id: 'a_' + Math.random().toString(36).slice(2, 9),
          x: Math.min(1, orig.x + dx),
          y: Math.min(1, orig.y + dy)
        }
      } else if (orig.kind === 'image') {
        copy = {
          ...orig,
          id: 'a_' + Math.random().toString(36).slice(2, 9),
          x: Math.min(1 - orig.w, orig.x + dx),
          y: Math.min(1 - orig.h, orig.y + dy)
        }
      } else {
        copy = {
          ...orig,
          id: 'a_' + Math.random().toString(36).slice(2, 9),
          points: orig.points.map((p) => ({
            x: Math.min(1, p.x + dx),
            y: Math.min(1, p.y + dy)
          }))
        }
      }
      return [...prev, copy]
    })
    setDirty(true)
  }, [])

  const addFormField = useCallback((f: FormField) => {
    setFormFields((prev) => [...prev, f])
    setDirty(true)
  }, [])

  const removeFormField = useCallback((id: string) => {
    setFormFields((prev) => prev.filter((f) => f.id !== id))
    setDirty(true)
  }, [])

  const undoAnnotation = useCallback(() => {
    if (formFields.length > 0) {
      setFormFields((prev) => prev.slice(0, -1))
    } else {
      setAnnotations((prev) => prev.slice(0, -1))
    }
  }, [formFields.length])

  const onSearchableReady = useCallback(async (newBytes: ArrayBuffer) => {
    await loadFromBytes(newBytes)
  }, [loadFromBytes])

  const handleOcrZone = useCallback(
    async (pageIdx: number, rect: { x: number; y: number; w: number; h: number }) => {
      if (!pdfBytes) return
      setBusy(true)
      try {
        const text = await ocrOnZone(pdfBytes, pageIdx, rect)
        setOcrZoneResult(text)
        setOcrZoneActive(false)
      } finally {
        setBusy(false)
      }
    },
    [pdfBytes]
  )

  const addEditableAnnotations = useCallback((newAnnots: Annotation[]) => {
    setAnnotations((prev) => [...prev, ...newAnnots])
    setDirty(true)
  }, [])

  const rotatePages = useCallback(
    async (angle: 0 | 90 | 180 | 270, indices?: number[]) => {
      if (!pdfBytes) return
      const targets = indices ?? Array.from(selected)
      if (targets.length === 0) return
      const ops = pages.map((p, i) => ({
        srcIndex: p.srcIndex,
        rotate: (targets.includes(i) ? angle : 0) as 0 | 90 | 180 | 270
      }))
      setBusy(true)
      try {
        const out = await window.api.pdfReorder(pdfBytes, ops)
        await loadFromBytes(out)
      } finally {
        setBusy(false)
      }
    },
    [pdfBytes, pages, selected, loadFromBytes]
  )

  const deletePages = useCallback(
    async (indices?: number[]) => {
      if (!pdfBytes) return
      const targets = indices ?? Array.from(selected)
      if (targets.length === 0) return
      const kept = pages
        .map((p, i) => ({ p, i }))
        .filter(({ i }) => !targets.includes(i))
        .map(({ p }) => ({ srcIndex: p.srcIndex, rotate: 0 as const }))
      if (kept.length === 0) {
        window.alert(
          `Impossible de supprimer toutes les ${pages.length} pages.\n\n` +
            `Un PDF doit contenir au moins une page. Désélectionne au moins une page ` +
            `(⌘+clic dessus pour la retirer de la sélection) puis réessaie.\n\n` +
            `Si tu veux fermer le document, utilise plutôt "Ouvrir" pour en charger un autre.`
        )
        return
      }
      setBusy(true)
      try {
        const out = await window.api.pdfReorder(pdfBytes, kept)
        await loadFromBytes(out)
      } finally {
        setBusy(false)
      }
    },
    [pdfBytes, pages, selected, loadFromBytes]
  )

  const reorderPages = useCallback(
    async (newOrder: number[]) => {
      if (!pdfBytes) return
      const ops = newOrder.map((i) => ({ srcIndex: pages[i].srcIndex, rotate: 0 as const }))
      setBusy(true)
      try {
        const out = await window.api.pdfReorder(pdfBytes, ops)
        await loadFromBytes(out)
      } finally {
        setBusy(false)
      }
    },
    [pdfBytes, pages, loadFromBytes]
  )

  const insertFromFile = useCallback(
    async (atIndex: number) => {
      if (!pdfBytes) return
      const paths = await window.api.openPdf(false)
      if (!paths || paths.length === 0) return
      const insBuf = await window.api.readPdf(paths[0])
      setBusy(true)
      try {
        const out = await window.api.pdfInsert(pdfBytes, insBuf, atIndex)
        await loadFromBytes(out)
      } finally {
        setBusy(false)
      }
    },
    [pdfBytes, loadFromBytes]
  )

  function onContextAction(
    action: 'rotate-cw' | 'rotate-ccw' | 'delete' | 'insertAfter',
    indices: number[]
  ): void {
    if (indices.length === 0) return
    if (action === 'rotate-cw') rotatePages(90, indices)
    else if (action === 'rotate-ccw') rotatePages(270, indices)
    else if (action === 'delete') deletePages(indices)
    else if (action === 'insertAfter') insertFromFile(indices[0] + 1)
  }

  const onZoom = useCallback((delta: number | 'fit') => {
    if (delta === 'fit') {
      setScale(1.2)
      return
    }
    setScale((s) => Math.max(0.5, Math.min(3, +(s + delta).toFixed(2))))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      const inInput =
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      if (meta && e.key === 'o') {
        e.preventDefault()
        openFile()
      } else if (meta && e.key === 's') {
        e.preventDefault()
        if (e.shiftKey) saveAs()
        else save()
      } else if (meta && e.key === 'z' && !inInput) {
        e.preventDefault()
        if (annotations.length > 0 || formFields.length > 0) undoAnnotation()
      } else if (meta && e.key === 'c' && !inInput && selectedAnnotationId) {
        e.preventDefault()
        copyAnnotationById(selectedAnnotationId)
      } else if (meta && e.key === 'x' && !inInput && selectedAnnotationId) {
        e.preventDefault()
        cutAnnotationById(selectedAnnotationId)
      } else if (meta && e.key === 'v' && !inInput && clipboardAnnotation) {
        e.preventDefault()
        pasteAtCurrent()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !inInput) {
        if (selectedAnnotationId) {
          e.preventDefault()
          removeAnnotation(selectedAnnotationId)
          setSelectedAnnotationId(null)
        } else if (tool === 'pages' && selected.size > 0) {
          e.preventDefault()
          const indices = Array.from(selected).sort((a, b) => a - b)
          deletePages(indices)
        }
      } else if (e.key === 'Escape') {
        setSelectedAnnotationId(null)
        setOcrZoneActive(false)
      } else if (meta && (e.key === '+' || e.key === '=')) {
        e.preventDefault()
        onZoom(0.25)
      } else if (meta && e.key === '-') {
        e.preventDefault()
        onZoom(-0.25)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    openFile,
    save,
    saveAs,
    onZoom,
    undoAnnotation,
    annotations,
    formFields.length,
    selectedAnnotationId,
    clipboardAnnotation,
    currentPage,
    pasteAnnotation,
    pasteAtCurrent,
    copyAnnotationById,
    cutAnnotationById,
    removeAnnotation,
    tool,
    selected,
    deletePages
  ])

  return (
    <div className="h-screen w-screen flex flex-col bg-cream">
      <Toolbar
        filePath={filePath}
        dirty={dirty}
        busy={busy}
        hasDoc={!!pdfBytes}
        tool={tool}
        numPages={pages.length}
        currentPage={currentPage}
        scale={scale}
        highlightColor={highlightColor}
        highlightOpacity={highlightOpacity}
        highlightMode={highlightMode}
        penColor={penColor}
        penWidth={penWidth}
        textSize={textSize}
        textColor={textColor}
        signatureDataUrl={signatureDataUrl}
        onOpen={openFile}
        onSave={save}
        onSaveAs={saveAs}
        onMerge={() => setDialog('merge')}
        onSplit={() => setDialog('split')}
        onExtract={() => setDialog('extract')}
        onZoom={onZoom}
        onSetHighlightColor={setHighlightColor}
        onSetHighlightOpacity={setHighlightOpacity}
        onSetHighlightMode={setHighlightMode}
        onSetPenColor={setPenColor}
        onSetPenWidth={setPenWidth}
        onSetTextSize={setTextSize}
        onSetTextColor={setTextColor}
        onCreateSignature={() => setDialog('signature')}
        onClearSignature={() => setSignatureDataUrl(null)}
        onUndo={undoAnnotation}
        hasAnnotations={annotations.length > 0 || formFields.length > 0}
        formFieldsCount={formFields.length}
      />
      <div className="flex flex-1 min-h-0">
        <Sidebar active={tool} onChange={setTool} hasDoc={!!pdfBytes} />
        {pdfBytes ? (
          tool === 'pages' ? (
            <main className="flex-1 min-w-0 overflow-hidden">
              <ThumbnailGrid
                pages={pages}
                currentPage={currentPage}
                selected={selected}
                onSelect={(i) => setCurrentPage(i)}
                onOpenPage={(i) => {
                  setCurrentPage(i)
                  setTool('annotate-highlight')
                }}
                onSelectionChange={setSelected}
                onReorder={reorderPages}
                onContextAction={onContextAction}
                onAppendPdf={() => insertFromFile(pages.length)}
              />
            </main>
          ) : (
            <>
              <ThumbnailStrip
                pages={pages}
                currentPage={currentPage}
                selected={selected}
                onSelect={(i) => setCurrentPage(i)}
                onSelectionChange={setSelected}
                onReorder={reorderPages}
                onContextAction={onContextAction}
              />
              <main className="flex-1 min-w-0 overflow-hidden">
                <PageViewer
                  pdfBytes={pdfBytes}
                  numPages={pages.length}
                  currentPage={currentPage}
                  setCurrentPage={setCurrentPage}
                  scale={scale}
                  tool={tool}
                  annotations={annotations}
                  onAddAnnotation={addAnnotation}
                  onUpdateAnnotation={updateAnnotation}
                  onRemoveAnnotation={removeAnnotation}
                  onDuplicateAnnotation={duplicateAnnotation}
                  onCopyAnnotation={copyAnnotationById}
                  onCutAnnotation={cutAnnotationById}
                  onPasteAnnotation={pasteAtCurrent}
                  canPasteAnnotation={clipboardAnnotation !== null}
                  formFields={formFields}
                  onAddFormField={addFormField}
                  onRemoveFormField={removeFormField}
                  highlightColor={highlightColor}
                  highlightOpacity={highlightOpacity}
                  highlightMode={highlightMode}
                  onSetTextSize={setTextSize}
                  selectedAnnotationId={selectedAnnotationId}
                  onSelectAnnotation={setSelectedAnnotationId}
                  ocrZoneActive={ocrZoneActive}
                  onOcrZone={handleOcrZone}
                  penColor={penColor}
                  penWidth={penWidth}
                  textSize={textSize}
                  textColor={textColor}
                  signatureDataUrl={signatureDataUrl}
                  onPlaceSignature={() => {
                    /* signature reste en mémoire pour placement multiple */
                  }}
                />
              </main>
              {tool === 'ocr' && (
                <OCRPanel
                  pdfBytes={pdfBytes}
                  numPages={pages.length}
                  currentPage={currentPage}
                  ocrZoneActive={ocrZoneActive}
                  zoneResult={ocrZoneResult}
                  onSearchableReady={onSearchableReady}
                  onToggleZoneMode={() => {
                    setOcrZoneActive((v) => !v)
                    setOcrZoneResult(null)
                  }}
                  onAddEditableAnnotations={addEditableAnnotations}
                  onClearZoneResult={() => setOcrZoneResult(null)}
                />
              )}
            </>
          )
        ) : (
          <main className="flex-1 min-w-0 overflow-hidden">
            <EmptyState onOpen={openFile} onMerge={() => setDialog('merge')} />
          </main>
        )}
      </div>

      {dialog === 'merge' && (
        <MergeDialog
          onClose={() => setDialog(null)}
          onDone={async (bytes) => {
            await loadFromBytes(bytes, 'fusion.pdf')
            setDialog(null)
          }}
        />
      )}
      {dialog === 'split' && pdfBytes && (
        <SplitDialog
          totalPages={pages.length}
          pdfBytes={pdfBytes}
          onClose={() => setDialog(null)}
          onDone={() => setDialog(null)}
        />
      )}
      {dialog === 'extract' && pdfBytes && (
        <ExtractDialog
          totalPages={pages.length}
          pdfBytes={pdfBytes}
          selected={selected}
          onClose={() => setDialog(null)}
          onDone={() => setDialog(null)}
        />
      )}
      {dialog === 'signature' && (
        <SignatureDialog
          onClose={() => setDialog(null)}
          onDone={(d) => {
            setSignatureDataUrl(d)
            setDialog(null)
          }}
        />
      )}
    </div>
  )
}
