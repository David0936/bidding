const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const isDev = !app.isPackaged;
let mainWindow = null;
let embeddedServer = null;
let embeddedUrlPromise = null;

function getIconPath() {
  return isDev
    ? path.join(__dirname, '..', 'web', 'public', 'logo.png')
    : path.join(__dirname, '..', 'web', 'dist', 'logo.png');
}

async function startEmbeddedServer() {
  if (embeddedUrlPromise) {
    return embeddedUrlPromise;
  }

  embeddedUrlPromise = (async () => {
    const serverEntry = path.join(__dirname, '..', 'server', 'dist', 'app.js');
    const webDist = path.join(__dirname, '..', 'web', 'dist');

    process.env.EASY_BIDDING_DATA_DIR = path.join(app.getPath('userData'), 'data');

    const { createApp } = await import(pathToFileURL(serverEntry).href);
    const expressApp = createApp({ staticDir: webDist, enableCors: false });

    embeddedServer = await new Promise((resolve, reject) => {
      const server = expressApp.listen(0, '127.0.0.1', () => resolve(server));
      server.once('error', reject);
    });

    const address = embeddedServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('无法获取桌面内嵌服务端口');
    }

    return `http://127.0.0.1:${address.port}`;
  })();

  return embeddedUrlPromise;
}

async function resolveAppUrl() {
  if (isDev) {
    return process.env.EASY_BIDDING_RENDERER_URL || 'http://127.0.0.1:5174';
  }

  return startEmbeddedServer();
}

async function createWindow() {
  const appUrl = await resolveAppUrl();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 720,
    title: '中集易标 easy bidding',
    icon: getIconPath(),
    backgroundColor: '#f7fbff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  await mainWindow.loadURL(appUrl);
}

function getAutoUpdater() {
  try {
    return require('electron-updater').autoUpdater;
  } catch (error) {
    console.warn('[updater] electron-updater 未安装或不可用:', error?.message ?? error);
    return null;
  }
}

function setupAutoUpdates() {
  if (isDev) {
    return;
  }

  const autoUpdater = getAutoUpdater();
  if (!autoUpdater) {
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.checkForUpdates().catch((error) => {
    console.warn('[updater] 检查更新失败:', error?.message ?? error);
  });
}

ipcMain.handle('app:get-version', () => app.getVersion());

ipcMain.handle('app:check-updates', async () => {
  if (isDev) {
    return { ok: false, message: '开发模式不检查更新' };
  }

  const autoUpdater = getAutoUpdater();
  if (!autoUpdater) {
    return { ok: false, message: '更新模块不可用' };
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, updateInfo: result?.updateInfo ?? null };
  } catch (error) {
    return { ok: false, message: error?.message ?? '检查更新失败' };
  }
});

app.setName('中集易标 easy bidding');

app.whenReady().then(async () => {
  setupAutoUpdates();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('before-quit', () => {
  if (embeddedServer) {
    embeddedServer.close();
    embeddedServer = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
