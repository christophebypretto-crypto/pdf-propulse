import { ipcMain } from 'electron'
import { PDFDocument, degrees } from 'pdf-lib'

async function loadDoc(data: ArrayBuffer): Promise<PDFDocument> {
  return await PDFDocument.load(data, { ignoreEncryption: true })
}

// Force un Uint8Array (potentiellement backé par SharedArrayBuffer) en ArrayBuffer
function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(u8.byteLength)
  new Uint8Array(out).set(u8)
  return out
}

export function registerPdfHandlers(): void {
  // Fusion : prend N ArrayBuffers, renvoie un PDF fusionne
  ipcMain.handle('pdf:merge', async (_evt, files: ArrayBuffer[]): Promise<ArrayBuffer> => {
    const out = await PDFDocument.create()
    for (const data of files) {
      const src = await loadDoc(data)
      const copied = await out.copyPages(src, src.getPageIndices())
      copied.forEach((p) => out.addPage(p))
    }
    const bytes = await out.save()
    return toArrayBuffer(bytes)
  })

  // Division : prend 1 PDF + plages [{from,to}], renvoie N ArrayBuffers
  ipcMain.handle(
    'pdf:split',
    async (
      _evt,
      data: ArrayBuffer,
      ranges: { from: number; to: number }[]
    ): Promise<ArrayBuffer[]> => {
      const src = await loadDoc(data)
      const results: ArrayBuffer[] = []
      for (const { from, to } of ranges) {
        const out = await PDFDocument.create()
        const indices: number[] = []
        for (let i = from; i <= to; i++) indices.push(i)
        const copied = await out.copyPages(src, indices)
        copied.forEach((p) => out.addPage(p))
        const bytes = await out.save()
        results.push(toArrayBuffer(bytes))
      }
      return results
    }
  )

  // Reorganiser / supprimer / pivoter : prend le PDF + une liste d'operations
  // ops = [{ srcIndex: number, rotate: 0|90|180|270 }]
  // L'ordre des ops dicte l'ordre final ; pages absentes = supprimees
  ipcMain.handle(
    'pdf:reorder',
    async (
      _evt,
      data: ArrayBuffer,
      ops: { srcIndex: number; rotate: 0 | 90 | 180 | 270 }[]
    ): Promise<ArrayBuffer> => {
      const src = await loadDoc(data)
      const out = await PDFDocument.create()
      const indices = ops.map((o) => o.srcIndex)
      const copied = await out.copyPages(src, indices)
      copied.forEach((page, i) => {
        const rotation = ops[i].rotate
        const currentRotation = page.getRotation().angle
        page.setRotation(degrees((currentRotation + rotation) % 360))
        out.addPage(page)
      })
      const bytes = await out.save()
      return toArrayBuffer(bytes)
    }
  )

  // Insertion : insere les pages d'un autre PDF a la position donnee
  ipcMain.handle(
    'pdf:insert',
    async (
      _evt,
      hostData: ArrayBuffer,
      insertData: ArrayBuffer,
      atIndex: number
    ): Promise<ArrayBuffer> => {
      const host = await loadDoc(hostData)
      const ins = await loadDoc(insertData)
      const copied = await host.copyPages(ins, ins.getPageIndices())
      copied.forEach((p, i) => host.insertPage(atIndex + i, p))
      const bytes = await host.save()
      return toArrayBuffer(bytes)
    }
  )

  // Extraction : extrait une plage de pages vers un nouveau PDF
  ipcMain.handle(
    'pdf:extract',
    async (
      _evt,
      data: ArrayBuffer,
      indices: number[]
    ): Promise<ArrayBuffer> => {
      const src = await loadDoc(data)
      const out = await PDFDocument.create()
      const copied = await out.copyPages(src, indices)
      copied.forEach((p) => out.addPage(p))
      const bytes = await out.save()
      return toArrayBuffer(bytes)
    }
  )
}
