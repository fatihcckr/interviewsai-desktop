# InterviewsAI Desktop - Geliştirici Rehberi

## 🏗️ Mimari Genel Bakış

### Electron Mimarisi
```
┌─────────────────────────────────────┐
│           Main Process              │
│  ┌─────────────────────────────────┐ │
│  │        main.js                  │ │
│  │  - Window Management            │ │
│  │  - IPC Handlers                 │ │
│  │  - Deep Link Processing         │ │
│  │  - Global Shortcuts             │ │
│  └─────────────────────────────────┘ │
└─────────────────────────────────────┘
                    │
                    │ IPC
                    ▼
┌─────────────────────────────────────┐
│         Renderer Process            │
│  ┌─────────────────────────────────┐ │
│  │       overlay.html              │ │
│  │  - UI Components                │ │
│  │  - Audio Capture                │ │
│  │  - Deepgram Integration         │ │
│  │  - API Communication            │ │
│  └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## 📁 Dosya Yapısı Detayı

### main.js - Ana Süreç
```javascript
// Temel sorumluluklar:
- Electron uygulamasını başlatma
- Pencere yönetimi (ana pencere + overlay)
- Deep link işleme
- IPC (Inter-Process Communication) handlers
- Global klavye kısayolları
- Sistem entegrasyonu
```

**Önemli Fonksiyonlar:**
- `createMainWindow()`: Ana pencere oluşturma
- `createOverlayWindow()`: Overlay penceresi oluşturma
- `handleDeepLink()`: Deep link işleme
- `registerShortcuts()`: Global kısayollar

### preload.js - Güvenlik Köprüsü
```javascript
// Temel sorumluluklar:
- Renderer process'e güvenli API erişimi
- IPC mesajlarını expose etme
- Context isolation sağlama
```

### overlay.html - Kullanıcı Arayüzü
```html
<!-- Temel bileşenler: -->
- Header (logo, kontroller, timer)
- Listening Status (transkript gösterimi)
- Content Area (soru/yanıt balonları)
- Actions (AI yanıt, ekran analizi)
- Manual Input (manuel mesaj)
```

## 🔧 Geliştirme Ortamı Kurulumu

### 1. Node.js Kurulumu
```bash
# Node.js v18+ gerekli
node --version
npm --version
```

### 2. Proje Bağımlılıkları
```bash
# Bağımlılıkları yükle
npm install

# Development dependencies
npm install --save-dev electron-builder
npm install --save-dev electron-packager
```

### 3. Environment Variables
```bash
# .env dosyası oluştur
NODE_ENV=development
API_URL=http://localhost:5000
DEEPGRAM_API_KEY=your_key_here
```

## 🎯 Temel Geliştirme Akışı

### 1. Yeni Özellik Ekleme
```javascript
// 1. main.js'de IPC handler ekle
ipcMain.handle('new-feature', async (event, data) => {
  // İş mantığı
  return result;
});

// 2. preload.js'de API expose et
contextBridge.exposeInMainWorld('electron', {
  newFeature: (data) => ipcRenderer.invoke('new-feature', data)
});

// 3. overlay.html'de kullan
const result = await window.electron.newFeature(data);
```

### 2. UI Bileşeni Ekleme
```html
<!-- overlay.html'de yeni bileşen -->
<div class="new-component">
  <button id="newBtn">New Feature</button>
</div>

<script>
// JavaScript'te event listener
document.getElementById('newBtn').addEventListener('click', async () => {
  // İş mantığı
});
</script>
```

### 3. Stil Ekleme
```css
/* overlay.html'de CSS */
.new-component {
  background: rgba(37, 37, 37, 0.5);
  border-radius: 10px;
  padding: 14px;
  border: 1px solid #404040;
}

.new-component button {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 10px;
  border-radius: 8px;
  cursor: pointer;
}
```

## 🔌 API Entegrasyonu

### Backend API Endpoints

#### 1. Deepgram Token Alma
```javascript
// main.js'de
ipcMain.on('start-listening', async (event, language) => {
  const API_URL = process.env.NODE_ENV === 'production' 
    ? 'https://interviewai-pro-production.up.railway.app'
    : 'http://localhost:5000';
  
  const response = await fetch(`${API_URL}/api/deepgram-token`, { 
    method: 'POST' 
  });
  
  const tokenData = await response.json();
  // Token'ı overlay'e gönder
});
```

#### 2. AI Chat API
```javascript
// overlay.html'de
const response = await fetch('http://localhost:5000/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages,
    resumeString,
    interviewSessionId: sessionId,
    customPrompt: sessionSettings?.extraInstructions || ''
  })
});
```

#### 3. Resume API
```javascript
// main.js'de
const response = await fetch(`${API_URL}/api/resumes/${settings.selectedResume.id}`);
const resumeData = await response.json();
```

## 🎤 Ses İşleme Detayları

### Audio Capture Mimarisi
```javascript
// overlay.html'de ses yakalama
async function startCombinedAudio() {
  // 1. Mikrofon stream'i al
  const micStream = await navigator.mediaDevices.getUserMedia({ 
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    } 
  });
  
  // 2. Sistem sesi stream'i al
  const systemStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: primarySource.id
      }
    }
  });
  
  // 3. Audio context oluştur
  const audioContext = new AudioContext();
  const destination = audioContext.createMediaStreamDestination();
  
  // 4. Stream'leri birleştir
  const micSource = audioContext.createMediaStreamSource(micStream);
  const systemSource = audioContext.createMediaStreamSource(systemStream);
  
  micSource.connect(destination);
  systemSource.connect(destination);
  
  // 5. MediaRecorder ile kaydet
  const mediaRecorder = new MediaRecorder(destination.stream);
  mediaRecorder.ondataavailable = (event) => {
    deepgramConnection.send(event.data);
  };
}
```

### Deepgram Entegrasyonu
```javascript
// Deepgram bağlantısı
const deepgram = createClient(token);
const connection = deepgram.listen.live({
  model: 'nova-2',
  language: 'en-US',
  smart_format: true,
  interim_results: true,
});

// Event listeners
connection.on(LiveTranscriptionEvents.Transcript, (data) => {
  const text = data.channel.alternatives[0].transcript;
  if (text) {
    // UI'da göster
    updateTranscript(text, data.is_final);
  }
});
```

## 🖼️ Ekran Yakalama

### Screenshot API
```javascript
// main.js'de
ipcMain.handle('capture-screenshot', async () => {
  const { desktopCapturer } = require('electron');
  
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: screen.getPrimaryDisplay().size
  });
  
  const screenshot = sources[0].thumbnail.toDataURL();
  const base64Data = screenshot.replace(/^data:image\/png;base64,/, '');
  
  return base64Data;
});
```

### Overlay'de Kullanım
```javascript
// overlay.html'de
const screenshotBase64 = await require('electron').ipcRenderer.invoke('capture-screenshot');

// API'ye gönder
const response = await fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({
    messages: [{
      role: 'user',
      content: 'Analyze this screen',
      data: {
        task: 'analyze-screen',
        imageUrl: `data:image/png;base64,${screenshotBase64}`
      }
    }]
  })
});
```

## 🔗 Deep Link Sistemi

### URL Formatı
```
interviewsai://session/{sessionId}?settings={encodedSettings}
```

### İşleme Süreci
```javascript
// main.js'de
function handleDeepLink(url) {
  const match = url.match(/interviewsai:\/\/session\/([^?]+)(?:\?settings=(.+))?/);
  
  if (match) {
    const sessionId = match[1];
    const encodedSettings = match[2];
    
    // Settings'i decode et
    const settings = JSON.parse(decodeURIComponent(encodedSettings));
    
    // Overlay'e gönder
    overlayWindow.webContents.executeJavaScript(`
      window.electronSessionId = '${sessionId}';
      window.electronSessionSettings = ${JSON.stringify(settings)};
    `);
  }
}
```

### Platform Desteği
```javascript
// Windows
app.setAsDefaultProtocolClient('interviewsai');

// macOS
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});
```

## ⌨️ Global Kısayollar

### Kısayol Tanımlama
```javascript
// main.js'de
function registerShortcuts() {
  globalShortcut.register('CommandOrControl+H', () => {
    if (overlayWindow) {
      overlayWindow.webContents.send('generate-response');
    }
  });
  
  globalShortcut.register('CommandOrControl+K', () => {
    if (overlayWindow) {
      overlayWindow.webContents.send('analyze-screen');
    }
  });
}
```

### Overlay'de Dinleme
```javascript
// overlay.html'de
require('electron').ipcRenderer.on('generate-response', () => {
  document.getElementById('aiAnswerBtn').click();
});

require('electron').ipcRenderer.on('analyze-screen', () => {
  document.getElementById('analyzeScreenBtn').click();
});
```

## 🎨 UI Bileşenleri

### CSS Sınıf Yapısı
```css
/* Ana container */
.container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Header */
.header {
  background: rgba(45, 45, 45, 0.5);
  padding: 8px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* Balon stilleri */
.question-balloon {
  background: #3b82f6;
  color: white;
  border-radius: 16px;
  padding: 12px 16px;
  margin-bottom: 12px;
}

.answer-balloon {
  background: rgba(55, 55, 55, 0.8);
  color: #e5e7eb;
  border-radius: 16px;
  padding: 12px 16px;
  border: 1px solid #404040;
}
```

### Responsive Tasarım
```css
/* Minimize durumu */
body.minimized .content,
body.minimized .actions,
body.minimized .listening-status {
  display: none;
}

/* Scrollbar stilleri */
.content::-webkit-scrollbar {
  width: 8px;
}

.content::-webkit-scrollbar-thumb {
  background: #404040;
  border-radius: 4px;
}
```

## 🐛 Debugging

### Console Logging
```javascript
// Ana süreçte
console.log('🔗 Deep link received:', url);
console.log('✅ Session data injected into overlay');

// Renderer süreçte
console.log('🎤 Starting with language:', language);
console.log('✅ Audio capture started successfully');
```

### DevTools
```javascript
// main.js'de DevTools'u aç
mainWindow.webContents.openDevTools();

// Overlay için de açabilirsin
overlayWindow.webContents.openDevTools();
```

### Error Handling
```javascript
// Try-catch blokları
try {
  const response = await fetch(API_URL);
  if (!response.ok) throw new Error('API Error');
} catch (error) {
  console.error('❌ Error:', error);
  // Kullanıcıya göster
  showError(error.message);
}
```

## 🚀 Build ve Distribution

### Package.json Scripts
```json
{
  "scripts": {
    "start": "electron .",
    "build": "electron-builder",
    "dist": "electron-builder --publish=never",
    "pack": "electron-builder --dir"
  }
}
```

### Build Konfigürasyonu
```json
{
  "build": {
    "appId": "com.interviewai.desktop",
    "productName": "InterviewsAI Desktop",
    "directories": {
      "output": "dist"
    },
    "files": [
      "main.js",
      "preload.js",
      "overlay.html",
      "logo.png",
      "package.json"
    ],
    "win": {
      "target": "nsis",
      "icon": "logo.png"
    },
    "mac": {
      "target": "dmg",
      "icon": "logo.png"
    },
    "linux": {
      "target": "AppImage",
      "icon": "logo.png"
    }
  }
}
```

## 📊 Performans Optimizasyonu

### Memory Management
```javascript
// Audio stream'leri temizle
function stopAudioCapture() {
  if (microphoneStream) {
    microphoneStream.getTracks().forEach(track => track.stop());
    microphoneStream = null;
  }
  
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}
```

### Event Listener Temizliği
```javascript
// Cleanup fonksiyonu
function cleanup() {
  // Event listener'ları kaldır
  document.removeEventListener('mousemove', handleMouseMove);
  
  // Timer'ları temizle
  clearInterval(timerInterval);
  
  // Audio capture'ı durdur
  stopAudioCapture();
}
```

## 🔒 Güvenlik

### Context Isolation
```javascript
// preload.js'de güvenli API
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Sadece gerekli API'leri expose et
  onDeepLink: (callback) => ipcRenderer.on('deep-link', callback),
  setIgnoreMouseEvents: (ignore, options) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options);
  }
});
```

### Input Validation
```javascript
// Kullanıcı girdilerini validate et
function validateInput(input) {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string');
  }
  
  if (input.length > 1000) {
    throw new Error('Input too long');
  }
  
  return input.trim();
}
```

## 🧪 Testing

### Unit Test Örneği
```javascript
// test/main.test.js
const { app } = require('electron');
const { createMainWindow } = require('../main');

describe('Main Process', () => {
  test('should create main window', () => {
    const window = createMainWindow();
    expect(window).toBeDefined();
    expect(window.isVisible()).toBe(true);
  });
});
```

### Integration Test
```javascript
// test/integration.test.js
describe('Audio Capture', () => {
  test('should start audio capture', async () => {
    const result = await startAudioCapture();
    expect(result).toBe(true);
  });
});
```

## 📝 Best Practices

### Kod Organizasyonu
- Fonksiyonları küçük ve tek sorumluluklu tut
- Magic number'ları constant olarak tanımla
- Error handling'i her zaman ekle
- Console.log'ları production'da kaldır

### Performance
- Lazy loading kullan
- Memory leak'leri önle
- Event listener'ları temizle
- Heavy operation'ları async yap

### Security
- Input validation yap
- API key'leri güvenli tut
- Context isolation kullan
- XSS koruması ekle

---

Bu rehber, InterviewsAI Desktop uygulamasının geliştirilmesi için gerekli tüm teknik detayları içerir. Sorularınız için GitHub Issues'u kullanabilirsiniz.
