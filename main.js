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
  console.log('🔗 Deep link received:', url);
  
  // URL parse et: interviewsai://session/SESSION_ID?settings=ENCODED_SETTINGS
  const match = url.match(/interviewsai:\/\/session\/([^?]+)(?:\?settings=(.+))?/);
  
  if (match) {
    const sessionId = match[1];
    const encodedSettings = match[2];
    
    console.log('📋 Session ID:', sessionId);
    console.log('⚙️ Encoded Settings:', encodedSettings ? 'Present' : 'Not provided');
    
    // Overlay window'u aç (yoksa oluştur)
    if (!overlayWindow) {
      createOverlayWindow();
    }
    
    const sendSessionData = () => {
      if (overlayWindow) {
        // Settings'i decode et
        let settings = null;
        if (encodedSettings) {
          try {
            settings = JSON.parse(decodeURIComponent(encodedSettings));
            console.log('✅ Parsed Settings:', settings);
          } catch (error) {
            console.error('❌ Failed to parse settings:', error);
          }
        }
        
        // Overlay'e session ID ve settings gönder
        overlayWindow.webContents.executeJavaScript(`
          window.electronSessionId = '${sessionId}';
          window.electronSessionSettings = ${JSON.stringify(settings)};
          console.log('✅ Session data injected into overlay');
          console.log('Session ID:', '${sessionId}');
          console.log('Settings:', ${JSON.stringify(settings)});
        `);
      }
    };

    // Overlay hazır olana kadar bekle
    if (overlayWindow.webContents.getURL().includes('overlay.html')) {
      setTimeout(sendSessionData, 1000);
    } else {
      overlayWindow.webContents.once('did-finish-load', () => {
        setTimeout(sendSessionData, 1000);
      });
    }
  }
}

// Get desktop sources for system audio capture
ipcMain.handle('get-desktop-sources', async () => {
  const { desktopCapturer } = require('electron');
  
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 }
    });
    
    return sources.map(source => ({
      id: source.id,
      name: source.name
    }));
  } catch (error) {
    console.error('Failed to get desktop sources:', error);
    return [];
  }
});


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

// Start listening IPC
ipcMain.on('start-listening', async (event, language) => {
  console.log('Starting listening with language:', language);
  
  try {
    // Backend'den Deepgram token al
    const API_URL = 'http://localhost:5000/api'; // Production'da değiştir
    const response = await fetch(`${API_URL}/deepgram-token`, { method: 'POST' });
    
    if (!response.ok) {
      throw new Error('Failed to get Deepgram token');
    }
    
    const tokenData = await response.json();
    
    // Token'ı overlay'e gönder
    if (overlayWindow) {
      overlayWindow.webContents.send('deepgram-token', {
        token: tokenData.key,
        language: language || 'en-US'
      });
    }
    
  } catch (error) {
    console.error('Failed to get token:', error);
    if (overlayWindow) {
      overlayWindow.webContents.send('listening-error', error.message);
    }
  }
});

// Stop listening IPC
ipcMain.on('stop-listening', (event) => {
  console.log('Stopping listening...');
  
  if (overlayWindow) {
    overlayWindow.webContents.send('stop-audio-capture');
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

// Screenshot handler
ipcMain.handle('capture-screenshot', async () => {
  try {
    const { screen } = require('electron');
    const { desktopCapturer } = require('electron');
    
    // Tüm ekranları al
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: screen.getPrimaryDisplay().size
    });
    
    if (sources.length === 0) {
      throw new Error('No screen sources available');
    }
    
    // İlk ekranın screenshot'ını al
    const primarySource = sources[0];
    const screenshot = primarySource.thumbnail.toDataURL();
    
    // Base64 string'den "data:image/png;base64," prefix'ini kaldır
    const base64Data = screenshot.replace(/^data:image\/png;base64,/, '');
    
    console.log('✅ Screenshot captured successfully');
    return base64Data;
    
  } catch (error) {
    console.error('❌ Failed to capture screenshot:', error);
    throw error;
  }
});