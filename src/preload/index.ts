import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  openPdf: (multi?: boolean): Promise<string[] | null> =>
    ipcRenderer.invoke('dialog:openPdf', multi),
  openPdfOrImage: (multi?: boolean): Promise<string[] | null> =>
    ipcRenderer.invoke('dialog:openPdfOrImage', multi),
  savePdf: (defaultName?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:savePdf', defaultName),
  readPdf: (filePath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('fs:readPdf', filePath),
  writePdf: (filePath: string, data: ArrayBuffer): Promise<boolean> =>
    ipcRenderer.invoke('fs:writePdf', filePath, data),
  imageToPdfBytes: (imagePath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('pdf:imageToPdfBytes', imagePath),

  pdfMerge: (files: ArrayBuffer[]): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('pdf:merge', files),
  pdfSplit: (data: ArrayBuffer, ranges: { from: number; to: number }[]): Promise<ArrayBuffer[]> =>
    ipcRenderer.invoke('pdf:split', data, ranges),
  pdfReorder: (
    data: ArrayBuffer,
    ops: { srcIndex: number; rotate: 0 | 90 | 180 | 270 }[]
  ): Promise<ArrayBuffer> => ipcRenderer.invoke('pdf:reorder', data, ops),
  pdfInsert: (host: ArrayBuffer, ins: ArrayBuffer, atIndex: number): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('pdf:insert', host, ins, atIndex),
  pdfExtract: (data: ArrayBuffer, indices: number[]): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('pdf:extract', data, indices)
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
