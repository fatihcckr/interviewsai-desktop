const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');

let mainWindow;

// Deep link protocol'ünü kaydet
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('interviewsai', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('interviewsai');
}

function createWindow(deepLinkUrl = null) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Web app'i yükle
  mainWindow.loadURL('http://localhost:5173');
  
  // DevTools'u aç
  mainWindow.webContents.openDevTools();

  // Deep link varsa işle
  if (deepLinkUrl) {
    handleDeepLink(deepLinkUrl);
  }
}

function handleDeepLink(url) {
  console.log('Deep link received:', url);
  
  // URL'den session ID'yi çıkar: interviewsai://session/abc123
  const match = url.match(/interviewsai:\/\/session\/(.+)/);
  if (match && mainWindow) {
    const sessionId = match[1];
    
    // Web app'e session ID'yi gönder - DOM fully loaded olana kadar bekle
    const sendSessionId = () => {
      mainWindow.webContents.executeJavaScript(`
        console.log('Session ID received from deep link:', '${sessionId}');
        window.electronSessionId = '${sessionId}';
        window.dispatchEvent(new CustomEvent('electron-deep-link', { detail: { sessionId: '${sessionId}' } }));
      `);
    };

    // Eğer sayfa zaten yüklüyse hemen gönder
    if (mainWindow.webContents.getURL().includes('localhost')) {
      setTimeout(sendSessionId, 1000); // 1 saniye bekle
    } else {
      // Sayfa henüz yüklenmediyse bekle
      mainWindow.webContents.once('did-finish-load', () => {
        setTimeout(sendSessionId, 1000); // 1 saniye bekle
      });
    }
  }
}

// Windows için deep link
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    
    // Windows'ta deep link URL komut satırında gelir
    const url = commandLine.find(arg => arg.startsWith('interviewsai://'));
    if (url) {
      handleDeepLink(url);
    }
  });
}

app.whenReady().then(() => {
  // Uygulama başlatılırken deep link kontrolü
  const url = process.argv.find(arg => arg.startsWith('interviewsai://'));
  createWindow(url);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// macOS için deep link
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) {
    handleDeepLink(url);
  } else {
    createWindow(url);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});