import { PDFDocument } from 'pdf-lib'

// Cree un PDF vierge d'une page A4 (portrait) pour "Nouveau projet".
export async function createBlankPdf(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create()
  doc.addPage([595.28, 841.89]) // A4 en points (72 dpi)
  const bytes = await doc.save()
  const out = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(out).set(bytes)
  return out
}
