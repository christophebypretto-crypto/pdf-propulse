import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { registerPdfHandlers } from './pdf/handlers'

function setupAutoUpdater(win: BrowserWindow): void {
  // Pas de check en dev
  if (is.dev) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    win.webContents.send('updater:status', { state: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    win.webContents.send('updater:status', { state: 'none' })
  })

  autoUpdater.on('download-progress', (p) => {
    win.webContents.send('updater:status', {
      state: 'downloading',
      percent: Math.round(p.percent)
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('updater:status', { state: 'ready', version: info.version })
    dialog
      .showMessageBox(win, {
        type: 'info',
        buttons: ['Redémarrer et installer', 'Plus tard'],
        defaultId: 0,
        cancelId: 1,
        title: 'Mise à jour disponible',
        message: `PDF 100K ${info.version} est prête à être installée.`,
        detail: "Redémarre l'app pour appliquer la mise à jour."
      })
      .then((res) => {
        if (res.response === 0) autoUpdater.quitAndInstall()
      })
  })

  autoUpdater.on('error', (err) => {
    win.webContents.send('updater:status', {
      state: 'error',
      message: err.message
    })
  })

  // Check au demarrage puis toutes les 30 min
  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    /* silencieux : si le repo est privé sans token, on ignore */
  })
  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch(() => {})
    },
    30 * 60 * 1000
  )

  ipcMain.handle('updater:check', async () => {
    try {
      const r = await autoUpdater.checkForUpdates()
      return r ? { version: r.updateInfo.version } : null
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('updater:quitAndInstall', () => {
    autoUpdater.quitAndInstall()
    return true
  })
}

function buildAppMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: 'PDF 100K',
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                label: 'Vérifier les mises à jour…',
                click: async () => {
                  try {
                    const r = await autoUpdater.checkForUpdates()
                    if (!r || !r.updateInfo) {
                      dialog.showMessageBox({
                        type: 'info',
                        message: "L'app est à jour.",
                        detail: 'Aucune nouvelle version disponible.'
                      })
                    }
                  } catch (e) {
                    dialog.showMessageBox({
                      type: 'warning',
                      message: 'Vérification impossible',
                      detail: e instanceof Error ? e.message : String(e)
                    })
                  }
                }
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    autoHideMenuBar: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#FAF6F2',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('fr.bypretto.pdf100k')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Dialogues file I/O
  ipcMain.handle('dialog:openPdf', async (_evt, multi: boolean = false) => {
    const result = await dialog.showOpenDialog({
      title: 'Ouvrir un PDF',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      properties: multi ? ['openFile', 'multiSelections'] : ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths
  })

  ipcMain.handle('dialog:openPdfOrImage', async (_evt, multi: boolean = false) => {
    const result = await dialog.showOpenDialog({
      title: 'Ajouter un PDF ou une image',
      filters: [
        { name: 'PDF ou image', extensions: ['pdf', 'jpg', 'jpeg', 'png'] },
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }
      ],
      properties: multi ? ['openFile', 'multiSelections'] : ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths
  })

  ipcMain.handle('dialog:savePdf', async (_evt, defaultName?: string) => {
    const result = await dialog.showSaveDialog({
      title: 'Enregistrer le PDF',
      defaultPath: defaultName || 'document.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (result.canceled || !result.filePath) return null
    return result.filePath
  })

  ipcMain.handle('fs:readPdf', async (_evt, filePath: string) => {
    const buf = await readFile(filePath)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  })

  ipcMain.handle('fs:writePdf', async (_evt, filePath: string, data: ArrayBuffer) => {
    await writeFile(filePath, Buffer.from(data))
    return true
  })

  registerPdfHandlers()
  buildAppMenu()

  const win = createWindow()
  setupAutoUpdater(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
