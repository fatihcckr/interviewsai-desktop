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
    visibleOnAllWorkspaces: true,
    skipTaskbar: true,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  overlayWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
  console.log(`[OVERLAY CONSOLE] ${message}`);
});

  overlayWindow.webContents.session.clearCache();
  overlayWindow.loadFile('overlay.html');

  // Her zaman en üstte kal
overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);

  
  // Screen capture'dan gizle (Windows)
  if (process.platform === 'win32') {
    overlayWindow.setContentProtection(false);
  }

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.once('ready-to-show', () => {
    const display = require('electron').screen.getPrimaryDisplay();
    const { width: screenWidth } = display.workArea;
    overlayWindow.setPosition(Math.floor(screenWidth / 2) - 200, 1);
  });

  // ← BURAYA EKLE (fonksiyonun en sonuna, kapanış parantezinden önce)
  overlayWindow.on('closed', () => {
    console.log('🔴 Overlay closed, cleaning up...');
    overlayWindow = null;
  });
}

function handleDeepLink(url) {
  console.log('🔗 Deep link received:', url);
  
  const match = url.match(/interviewsai:\/\/session\/([^?]+)(?:\?settings=(.+))?/);

if (match) {
  let sessionId = match[1];  // ← const → let yap
  const encodedSettings = match[2];
    
    console.log('📋 Session ID:', sessionId);
    console.log('⚙️ Encoded Settings:', encodedSettings ? 'Present' : 'Not provided');
    
    if (!overlayWindow) {
      createOverlayWindow();
    }
    
    const sendSessionData = async () => {
      if (overlayWindow) {
        let settings = null;
        if (encodedSettings) {
          try {
            settings = JSON.parse(decodeURIComponent(encodedSettings));
            console.log('✅ Parsed Settings:', settings);

            const API_URL = app.isPackaged 
            ? 'https://interviewai-pro-production.up.railway.app'
            : 'http://localhost:5000';

// ===== YENİ: Session start time'ı hesapla ve inject et =====
let sessionStartTime = Date.now();

// Eğer restore edilen session varsa, duration'dan hesapla
const userId = settings.userId;

if (sessionId.startsWith('session-') && !sessionId.includes('temp') && userId) {
  try {
    const sessionResponse = await fetch(`${API_URL}/api/sessions/${userId}`);
    if (sessionResponse.ok) {
      const allSessions = await sessionResponse.json();
      const existingSession = allSessions.find((s) => s.id === sessionId);
      
      if (existingSession && existingSession.duration) {
        const [h, m, s] = existingSession.duration.split(':').map(Number);
        const totalSeconds = h * 3600 + m * 60 + s;
        sessionStartTime = Date.now() - (totalSeconds * 1000);
        console.log(`⏱️ Session restored with ${totalSeconds} seconds elapsed`);
      }
    }
  } catch (error) {
    console.error('Failed to fetch session for timer restore:', error);
  }
}

overlayWindow.webContents.executeJavaScript(`
  window.sessionStartTime = ${sessionStartTime};
  console.log('⏱️ Session start time set:', ${sessionStartTime});
`); 

// ===== YENİ: Backend'e session başlat ve credit düşür =====
console.log('💳 Starting session and deducting credit...');
try {
  const userId = settings.userId;
  
  if (userId) {
    const sessionStartResponse = await fetch(`${API_URL}/api/sessions/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId,
        company: settings.company,
        position: settings.jobTitle,
        settings: settings
      })
    });
    
    if (sessionStartResponse.ok) {
      const result = await sessionStartResponse.json();
      console.log('✅ Session started, credit deducted');
      console.log('💳 New balance:', result.user.sessions_remaining);
      
      // ===== ÖNEMLİ: Backend'den gelen session ID'yi kullan =====
      sessionId = result.session.id;
      console.log('🔑 Using backend session ID:', sessionId);
    } else {
      console.error('❌ Failed to start session:', sessionStartResponse.status);
    }
  } else {
    console.warn('⚠️ No userId in settings, skipping credit deduction');
  }
} catch (error) {
  console.error('❌ Session start error:', error);
}

// ===== Session data'yı inject et (YENİ ID ile!) =====
overlayWindow.webContents.executeJavaScript(`
  window.electronSessionId = '${sessionId}';
  window.electronSessionSettings = ${JSON.stringify(settings)};
  console.log('✅ Session data injected with ID: ${sessionId}');
`);
            
            // ===== YENİ: Token'ı HEMEN al ve gönder =====
            console.log('🔑 Fetching Deepgram token immediately...');
                     
            try {
              const tokenResponse = await fetch(`${API_URL}/api/deepgram-token`, { method: 'POST' });
              if (tokenResponse.ok) {
                const tokenData = await tokenResponse.json();
                console.log('✅ Token received, sending to overlay...');
                
                // Token'ı HEMEN gönder
                overlayWindow.webContents.send('deepgram-token', {
                  token: tokenData.key,
                  language: settings.language || 'en-US'
                });
              } else {
                console.error('❌ Failed to get token:', tokenResponse.status);
              }
            } catch (error) {
              console.error('❌ Token fetch error:', error);
            }
            
            // ===== Resume'ü arka planda fetch et =====
            if (settings.selectedResume?.id && !settings.selectedResume.content) {
              console.log('🔍 Resume has no content, fetching from backend...');
              
              try {
                const response = await fetch(`${API_URL}/api/resumes/${settings.selectedResume.id}`);
                
                if (response.ok) {
                  const resumeData = await response.json();
                  settings.selectedResume = {
                    id: resumeData.id,
                    fileName: resumeData.file_name,
                    content: resumeData.content,
                    fileType: resumeData.file_type,
                    fileSize: resumeData.file_size
                  };
                  console.log('✅ Resume loaded from backend:', resumeData.file_name);
                  
                  overlayWindow.webContents.executeJavaScript(`
                    if (window.electronSessionSettings) {
                      window.electronSessionSettings.selectedResume = ${JSON.stringify(settings.selectedResume)};
                      console.log('✅ Resume content updated in overlay');
                    }
                  `);
                } else {
                  console.error('❌ Failed to fetch resume:', response.status);
                }
              } catch (error) {
                console.error('❌ Error fetching resume:', error);
              }
            }
            
          } catch (error) {
            console.error('❌ Failed to parse settings:', error);
          }
        }
      }
    };

    if (overlayWindow.webContents.getURL().includes('overlay.html')) {
      sendSessionData();
    } else {
      overlayWindow.webContents.once('did-finish-load', () => {
        sendSessionData();
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
  // Main window yerine overlay'i focus et
  if (overlayWindow) {
    overlayWindow.focus();
  }
  
  const url = commandLine.find(arg => arg.startsWith('interviewsai://'));
  if (url) {
    handleDeepLink(url);
  }
});
}

app.whenReady().then(() => {
  const url = process.argv.find(arg => arg.startsWith('interviewsai://'));
  
  // Keyboard shortcuts
  registerShortcuts();
  
  // Deep link varsa işle, yoksa da overlay'i aç
  if (url) {
    handleDeepLink(url);
  }

  app.on('activate', () => {
    // Hiçbir pencere açık değilse, overlay aç
    if (BrowserWindow.getAllWindows().length === 0 && !overlayWindow) {
      // Deep link yoksa boş overlay aç (gerekirse)
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
  // Ctrl+G: Generate AI response
globalShortcut.register('CommandOrControl+G', () => {
  console.log('Ctrl+G pressed');
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