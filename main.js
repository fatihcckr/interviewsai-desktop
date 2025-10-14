const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const path = require('path');

let mainWindow;
let overlayWindow;

// Deep link protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('interviewsai', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('interviewsai');
}

function createMainWindow(deepLinkUrl = null) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadURL('http://localhost:5173');
  mainWindow.webContents.openDevTools();

  if (deepLinkUrl) {
    handleDeepLink(deepLinkUrl);
  }
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 400,
    height: 600,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  overlayWindow.loadFile('overlay.html');
  
  // Screen capture'dan gizle (Windows)
  if (process.platform === 'win32') {
    overlayWindow.setContentProtection(true);
  }

  // ← BU SATIRI EKLE (setContentProtection'dan SONRA)
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.once('ready-to-show', () => {
  const display = require('electron').screen.getPrimaryDisplay();
  const { width: screenWidth } = display.workArea;
  overlayWindow.setPosition(Math.floor(screenWidth / 2) - 200, 1); // 60px → 40px
});
}

function handleDeepLink(url) {
  console.log('Deep link received:', url);
  
  const match = url.match(/interviewsai:\/\/session\/(.+)/);
  if (match) {
    const sessionId = match[1];
    
    // Overlay window'u aç
    if (!overlayWindow) {
      createOverlayWindow();
    }
    
    const sendSessionId = () => {
      if (overlayWindow) {
        overlayWindow.webContents.executeJavaScript(`
          console.log('Session ID:', '${sessionId}');
          window.electronSessionId = '${sessionId}';
        `);
      }
    };

    if (overlayWindow.webContents.getURL().includes('localhost')) {
      setTimeout(sendSessionId, 1000);
    } else {
      overlayWindow.webContents.once('did-finish-load', () => {
        setTimeout(sendSessionId, 1000);
      });
    }
  }
}

// Mouse events IPC
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  if (overlayWindow) {
    overlayWindow.setIgnoreMouseEvents(ignore, options);
  }
});

// Hide overlay IPC
let isMinimized = false;
let savedSize = { width: 400, height: 600 };
let savedPosition = { x: 0, y: 0 }; // Kaydedilen pozisyon

ipcMain.on('hide-overlay', () => {
  if (overlayWindow) {
    if (isMinimized) {
      // Restore
      overlayWindow.setSize(savedSize.width, savedSize.height);
      overlayWindow.setPosition(savedPosition.x, savedPosition.y);
      isMinimized = false;
    } else {
      // Minimize
      const [currentWidth, currentHeight] = overlayWindow.getSize();
      const [currentX, currentY] = overlayWindow.getPosition();
      
      savedSize = { width: currentWidth, height: currentHeight };
      savedPosition = { x: currentX, y: currentY };
      
      overlayWindow.setSize(currentWidth, 64); // 50 → 64 (header'ın tam yüksekliği)
      
      isMinimized = true;
    }
    
    overlayWindow.webContents.send('toggle-minimize', isMinimized);
  }
});

// End session IPC
ipcMain.on('end-session', () => {
  if (overlayWindow) {
    overlayWindow.close();
  }
});

// Windows deep link
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    
    const url = commandLine.find(arg => arg.startsWith('interviewsai://'));
    if (url) {
      handleDeepLink(url);
    }
  });
}

app.whenReady().then(() => {
  const url = process.argv.find(arg => arg.startsWith('interviewsai://'));
  createMainWindow(url);

  // Keyboard shortcuts
  registerShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// macOS deep link
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function registerShortcuts() {
  // Ctrl+H: Generate AI response
  globalShortcut.register('CommandOrControl+H', () => {
    console.log('Ctrl+H pressed');
    if (overlayWindow) {
      overlayWindow.webContents.send('generate-response');
    }
  });

  // Ctrl+K: Analyze screen
  globalShortcut.register('CommandOrControl+K', () => {
    console.log('Ctrl+K pressed');
    if (overlayWindow) {
      overlayWindow.webContents.send('analyze-screen');
    }
  });

  // Ctrl+B: Toggle hide/show ← BU SATIRI EKLE
  globalShortcut.register('CommandOrControl+B', () => {
    console.log('Ctrl+B pressed');
    if (overlayWindow) {
      overlayWindow.webContents.send('toggle-hide');
    }
  });

  // Arrow keys to move overlay
  globalShortcut.register('CommandOrControl+Left', () => moveOverlay(-50, 0));
  globalShortcut.register('CommandOrControl+Right', () => moveOverlay(50, 0));
  globalShortcut.register('CommandOrControl+Up', () => moveOverlay(0, -50));
  globalShortcut.register('CommandOrControl+Down', () => moveOverlay(0, 50));
}

function moveOverlay(x, y) {
  if (overlayWindow) {
    const [currentX, currentY] = overlayWindow.getPosition();
    const [width, height] = overlayWindow.getSize();
    const display = require('electron').screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = display.workArea;
    
    // Yeni pozisyonu hesapla
    let newX = currentX + x;
    let newY = currentY + y;
    
    // Ekran sınırlarını kontrol et
    if (newX < 0) newX = 0;
    if (newY < 0) newY = 0;
    if (newX + width > screenWidth) newX = screenWidth - width;
    if (newY + height > screenHeight) newY = screenHeight - height;
    
    overlayWindow.setPosition(newX, newY);
  }
}