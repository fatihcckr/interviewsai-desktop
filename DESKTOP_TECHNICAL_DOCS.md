# InterviewsAI Desktop - Technical Documentation

**Version:** 1.0.1  
**Last Updated:** 2025  
**Target Audience:** Senior Developers, Technical Writers, Bug Fixers

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Deep Linking System](#2-deep-linking-system)
3. [IPC Communication](#3-ipc-communication)
4. [Audio & Screen Capture](#4-audio--screen-capture)
5. [Build & Release Process](#5-build--release-process)
6. [Troubleshooting Guide](#6-troubleshooting-guide)

---

## 1. Architecture Overview

### 1.1 Electron Process Model

This application follows Electron's standard multi-process architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Process (main.js)                   │
│  • Application lifecycle management                          │
│  • Window creation and management                           │
│  • Deep link protocol registration                          │
│  • IPC handlers (ipcMain)                                   │
│  • Global keyboard shortcuts                                │
│  • System-level APIs (desktopCapturer, screen)             │
│  • Native OS integrations                                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            │ IPC Bridge (preload.js)
                            │
┌───────────────────────────▼─────────────────────────────────┐
│              Renderer Process (overlay.html)                │
│  • UI rendering and user interactions                       │
│  • Audio stream management (Web Audio API)                  │
│  • Deepgram WebSocket connection                           │
│  • Backend API calls (fetch)                                │
│  • DOM manipulation and state management                    │
│  • IPC invocations (ipcRenderer)                            │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Main Process (`main.js`)

**Location:** `main.js`  
**Purpose:** Backend of Electron application, runs with Node.js privileges

#### Key Responsibilities:

1. **Application Initialization**
   - Registers the `interviewsai://` protocol handler
   - Sets up single-instance lock (Windows)
   - Registers global keyboard shortcuts
   - Handles app lifecycle events

2. **Window Management**
   - Creates and manages `mainWindow` (development window, loads `localhost:5173`)
   - Creates and manages `overlayWindow` (transparent overlay interface)
   - Handles window positioning, sizing, and visibility

3. **Deep Link Processing**
   - Parses `interviewsai://session/{id}?settings={json}` URLs
   - Fetches session data from backend API
   - Injects session data into renderer process
   - Manages session lifecycle

4. **System Integration**
   - Desktop audio capture via `desktopCapturer`
   - Screenshot capture
   - Mouse event passthrough management
   - Content protection (Windows screen recording prevention)

#### Critical Code Sections:

```javascript
// Protocol registration (lines 8-14)
if (process.defaultApp) {
  // Development mode: register with explicit path
  app.setAsDefaultProtocolClient('interviewsai', process.execPath, [path.resolve(process.argv[1])]);
} else {
  // Production: simple registration
  app.setAsDefaultProtocolClient('interviewsai');
}

// Overlay window creation (lines 35-81)
function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 400,
    height: 600,
    transparent: true,        // ← Critical for overlay effect
    frame: false,             // ← No window chrome
    alwaysOnTop: true,        // ← Stays above all windows
    visibleOnAllWorkspaces: true,  // ← Visible on all virtual desktops
    skipTaskbar: true,        // ← Doesn't appear in taskbar
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,  // ← Allows require() in renderer
      contextIsolation: false // ← Disabled for simplicity (security trade-off)
    }
  });
  
  // Windows-specific: Prevent overlay from appearing in screen recordings
  if (process.platform === 'win32') {
    overlayWindow.setContentProtection(true);
  }
  
  // Initial mouse passthrough (allows clicks to pass through)
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
}
```

### 1.3 Renderer Process (`overlay.html`)

**Location:** `overlay.html` (single-file HTML with inline CSS and JavaScript)  
**Purpose:** User interface and application logic

#### Key Responsibilities:

1. **UI Rendering**
   - Header with controls (logo, timer, audio toggles, end session)
   - Listening status marquee (shows live transcript)
   - Content area (question/answer balloons)
   - Action buttons (Generate Answer, Analyze Screen)
   - Manual input field

2. **Audio Processing**
   - Prepares microphone stream via `getUserMedia()`
   - Prepares system audio stream via IPC (`get-desktop-sources`)
   - Mixes audio sources using Web Audio API
   - Sends audio chunks to Deepgram WebSocket

3. **State Management**
   - Session ID and settings (injected from main process)
   - Conversation history array
   - Timer state
   - Audio capture state

4. **Backend Communication**
   - Fetches Deepgram token
   - Sends chat requests with streaming responses
   - Auto-saves session data every 5 seconds
   - Finalizes session on end

#### Critical Code Sections:

```javascript
// Audio preparation (lines 928-949)
audioPreparationPromise = (async () => {
  try {
    // 1. System audio via IPC
    await prepareSystemAudio();
    
    // 2. Microphone directly
    const micStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    });
    microphoneStream = micStream;
    return true;
  } catch (error) {
    console.error('❌ Failed to prepare audio:', error);
    return false;
  }
})();
```

### 1.4 Transparent Overlay Mechanism

The overlay achieves transparency through several Electron window options:

#### Window Configuration:

```javascript
transparent: true  // ← Enables window transparency
```

This allows the window background to be transparent. The CSS in `overlay.html` sets:

```css
body {
  background: rgba(26, 26, 26, 0.50);  /* Semi-transparent dark background */
}
```

#### Mouse Passthrough Logic:

The overlay uses a dynamic mouse passthrough system:

1. **Initial State:** `setIgnoreMouseEvents(true, { forward: true })`
   - Mouse clicks pass through the overlay to underlying windows
   - `forward: true` ensures clicks are forwarded to the window below

2. **Interactive Detection:** Renderer monitors mouse position
   ```javascript
   document.addEventListener('mousemove', (e) => {
     const isOverInteractive = e.target.closest('button, .content, .header, .listening-status, .manual-input');
     
     if (isOverInteractive) {
       // Enable mouse events when over interactive elements
       ipcRenderer.send('set-ignore-mouse-events', false);
     } else {
       // Disable mouse events when over transparent areas
       ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
     }
   });
   ```

3. **Main Process Handler:**
   ```javascript
   ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
     if (overlayWindow) {
       overlayWindow.setIgnoreMouseEvents(ignore, options);
     }
   });
   ```

#### Always-On-Top Behavior:

```javascript
overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
```

- `'screen-saver'` level ensures it stays above normal windows
- Level `1` is the highest priority within that level
- Combined with `visibleOnAllWorkspaces: true`, overlay appears on all virtual desktops

---

## 2. Deep Linking System

### 2.1 Protocol Registration

The `interviewsai://` protocol is registered at the OS level to allow web applications to trigger the desktop app.

#### Registration Code:

```javascript
// Development mode (lines 8-11)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('interviewsai', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  // Production mode (line 13)
  app.setAsDefaultProtocolClient('interviewsai');
}
```

**How it works:**
- **Development:** Uses explicit executable path and script path
- **Production:** Uses the installed app's executable path
- On Windows: Creates registry entries in `HKEY_CURRENT_USER\Software\Classes\interviewsai`
- On macOS: Updates `Info.plist` with `CFBundleURLTypes`

### 2.2 Deep Link Format

```
interviewsai://session/{sessionId}?settings={urlEncodedJSON}
```

**Example:**
```
interviewsai://session/session-123?settings=%7B%22userId%22%3A%22user-456%22%2C%22language%22%3A%22en-US%22%7D
```

**Decoded settings:**
```json
{
  "userId": "user-456",
  "language": "en-US",
  "company": "Acme Corp",
  "jobTitle": "Software Engineer",
  "selectedResume": {
    "id": "resume-789",
    "fileName": "resume.pdf"
  },
  "extraInstructions": "Focus on technical skills",
  "aiModel": "claude-sonnet-4.5"
}
```

### 2.3 Deep Link Handling Flow

#### Windows Handling:

```javascript
// Single instance lock (lines 328-343)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();  // Another instance is running
} else {
  app.on('second-instance', (event, commandLine) => {
    // Focus existing overlay
    if (overlayWindow) {
      overlayWindow.focus();
    }
    
    // Extract deep link from command line
    const url = commandLine.find(arg => arg.startsWith('interviewsai://'));
    if (url) {
      handleDeepLink(url);
    }
  });
}

// Initial launch (lines 345-354)
app.whenReady().then(() => {
  const url = process.argv.find(arg => arg.startsWith('interviewsai://'));
  if (url) {
    handleDeepLink(url);
  }
});
```

#### macOS Handling:

```javascript
// macOS-specific handler (lines 365-368)
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});
```

**Key Difference:**
- **Windows:** Deep link arrives via `process.argv` or `second-instance` event
- **macOS:** Deep link arrives via `open-url` event (even when app is running)

### 2.4 Deep Link Processing (`handleDeepLink`)

**Location:** `main.js`, lines 83-252

#### Step-by-Step Flow:

1. **URL Parsing:**
   ```javascript
   const match = url.match(/interviewsai:\/\/session\/([^?]+)(?:\?settings=(.+))?/);
   let sessionId = match[1];
   const encodedSettings = match[2];
   ```

2. **Overlay Creation:**
   ```javascript
   if (!overlayWindow) {
     createOverlayWindow();
   }
   ```

3. **Settings Decoding:**
   ```javascript
   const settings = JSON.parse(decodeURIComponent(encodedSettings));
   ```

4. **Session Timer Restoration:**
   ```javascript
   // If session exists, restore timer from backend
   if (sessionId.startsWith('session-') && !sessionId.includes('temp') && userId) {
     const sessionResponse = await fetch(`${API_URL}/api/sessions/${userId}`);
     const existingSession = allSessions.find((s) => s.id === sessionId);
     
     if (existingSession && existingSession.duration) {
       const [h, m, s] = existingSession.duration.split(':').map(Number);
       const totalSeconds = h * 3600 + m * 60 + s;
       sessionStartTime = Date.now() - (totalSeconds * 1000);
     }
   }
   ```

5. **Backend Session Start:**
   ```javascript
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
   
   const result = await sessionStartResponse.json();
   sessionId = result.session.id;  // ← Use backend's session ID
   ```

6. **Data Injection into Renderer:**
   ```javascript
   overlayWindow.webContents.executeJavaScript(`
     window.sessionStartTime = ${sessionStartTime};
     window.electronSessionId = '${sessionId}';
     window.electronSessionSettings = ${JSON.stringify(settings)};
   `);
   ```

7. **Deepgram Token Fetch:**
   ```javascript
   const tokenResponse = await fetch(`${API_URL}/api/deepgram-token`, { method: 'POST' });
   const tokenData = await tokenResponse.json();
   
   overlayWindow.webContents.send('deepgram-token', {
     token: tokenData.key,
     language: settings.language || 'en-US'
   });
   ```

8. **Resume Content Fetch (if needed):**
   ```javascript
   if (settings.selectedResume?.id && !settings.selectedResume.content) {
     const response = await fetch(`${API_URL}/resumes/${settings.selectedResume.id}`);
     const resumeData = await response.json();
     settings.selectedResume.content = resumeData.content;
     
     // Update in renderer
     overlayWindow.webContents.executeJavaScript(`
       window.electronSessionSettings.selectedResume = ${JSON.stringify(settings.selectedResume)};
     `);
   }
   ```

### 2.5 Testing Deep Links

#### Windows:
```powershell
# Test in development
start interviewsai://session/test?settings=%7B%22userId%22%3A%22test%22%7D

# Test in production (after installation)
interviewsai://session/test?settings=%7B%22userId%22%3A%22test%22%7D
```

#### macOS:
```bash
# Test in development
open "interviewsai://session/test?settings=%7B%22userId%22%3A%22test%22%7D"

# Test in production
open "interviewsai://session/test?settings=%7B%22userId%22%3A%22test%22%7D"
```

---

## 3. IPC Communication

### 3.1 IPC Architecture

IPC (Inter-Process Communication) enables secure communication between the main process (Node.js) and renderer processes (Chromium).

**Bridge:** `preload.js` (minimal bridge, but `contextIsolation: false` allows direct `require('electron')`)

### 3.2 IPC Channels Reference

#### 3.2.1 Main → Renderer (One-Way)

| Channel | Trigger | Purpose | Handler Location |
|---------|---------|---------|------------------|
| `deepgram-token` | Main process | Sends Deepgram API token to renderer | `main.js:194` |
| `generate-response` | Global shortcut `Ctrl/Cmd+G` | Triggers AI answer generation | `main.js:381` |
| `analyze-screen` | Global shortcut `Ctrl/Cmd+K` | Triggers screen analysis | `main.js:389` |
| `toggle-hide` | Global shortcut `Ctrl/Cmd+B` | Toggles overlay minimize | `main.js:397` |
| `toggle-minimize` | Hide overlay IPC | Updates renderer minimize state | `main.js:307` |
| `stop-audio-capture` | Stop listening IPC | Stops audio capture | `main.js:323` |

**Example Usage:**
```javascript
// Main process sends token
overlayWindow.webContents.send('deepgram-token', {
  token: tokenData.key,
  language: 'en-US'
});

// Renderer receives token
require('electron').ipcRenderer.on('deepgram-token', async (event, data) => {
  // Initialize Deepgram connection
});
```

#### 3.2.2 Renderer → Main (Invoke/Request-Response)

| Channel | Invoker | Purpose | Handler Location |
|---------|---------|---------|------------------|
| `get-desktop-sources` | Renderer | Gets desktop audio sources | `main.js:255` |
| `capture-screenshot` | Renderer | Captures screen screenshot | `main.js:430` |

**Example Usage:**
```javascript
// Renderer invokes
const sources = await require('electron').ipcRenderer.invoke('get-desktop-sources');

// Main process handles
ipcMain.handle('get-desktop-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1, height: 1 }
  });
  return sources.map(source => ({ id: source.id, name: source.name }));
});
```

#### 3.2.3 Renderer → Main (One-Way)

| Channel | Sender | Purpose | Handler Location |
|---------|--------|---------|------------------|
| `set-ignore-mouse-events` | Renderer | Controls mouse passthrough | `main.js:276` |
| `hide-overlay` | Renderer | Minimizes/restores overlay | `main.js:287` |
| `end-session` | Renderer | Closes overlay window | `main.js:312` |
| `stop-listening` | Renderer | Stops audio capture | `main.js:319` |

**Example Usage:**
```javascript
// Renderer sends
require('electron').ipcRenderer.send('set-ignore-mouse-events', false);

// Main process handles
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  if (overlayWindow) {
    overlayWindow.setIgnoreMouseEvents(ignore, options);
  }
});
```

### 3.3 Detailed IPC Handler Implementations

#### 3.3.1 `get-desktop-sources`

**Purpose:** Retrieves available desktop audio sources for system audio capture.

**Implementation:**
```javascript
ipcMain.handle('get-desktop-sources', async () => {
  const { desktopCapturer } = require('electron');
  
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 }  // Minimal size, we only need IDs
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
```

**Renderer Usage:**
```javascript
async function prepareSystemAudio() {
  const sources = await require('electron').ipcRenderer.invoke('get-desktop-sources');
  const primarySource = sources[0];
  
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: primarySource.id
      }
    }
  });
}
```

#### 3.3.2 `capture-screenshot`

**Purpose:** Captures a full-screen screenshot for AI analysis.

**Implementation:**
```javascript
ipcMain.handle('capture-screenshot', async () => {
  try {
    const { screen } = require('electron');
    const { desktopCapturer } = require('electron');
    
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: screen.getPrimaryDisplay().size  // Full resolution
    });
    
    if (sources.length === 0) {
      throw new Error('No screen sources available');
    }
    
    const primarySource = sources[0];
    const screenshot = primarySource.thumbnail.toDataURL();
    
    // Remove data URL prefix, return base64 only
    const base64Data = screenshot.replace(/^data:image\/png;base64,/, '');
    return base64Data;
    
  } catch (error) {
    console.error('❌ Failed to capture screenshot:', error);
    throw error;
  }
});
```

**Renderer Usage:**
```javascript
const screenshotBase64 = await require('electron').ipcRenderer.invoke('capture-screenshot');

// Send to backend API
messages.push({
  role: 'user',
  content: "Analyze this screen",
  data: {
    task: 'analyze-screen',
    imageUrl: `data:image/png;base64,${screenshotBase64}`
  }
});
```

#### 3.3.3 `set-ignore-mouse-events`

**Purpose:** Dynamically enables/disables mouse passthrough for transparent overlay.

**Implementation:**
```javascript
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  if (overlayWindow) {
    overlayWindow.setIgnoreMouseEvents(ignore, options);
  }
});
```

**Renderer Usage:**
```javascript
document.addEventListener('mousemove', (e) => {
  const isOverInteractive = e.target.closest('button, .content, .header');
  
  if (isOverInteractive) {
    require('electron').ipcRenderer.send('set-ignore-mouse-events', false);
  } else {
    require('electron').ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
  }
});
```

**Parameters:**
- `ignore` (boolean): `true` = clicks pass through, `false` = clicks captured
- `options` (object): `{ forward: true }` forwards clicks to window below

#### 3.3.4 `hide-overlay`

**Purpose:** Minimizes overlay to header-only (64px height) or restores to full size.

**Implementation:**
```javascript
let isMinimized = false;
let savedSize = { width: 400, height: 600 };
let savedPosition = { x: 0, y: 0 };

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
      
      overlayWindow.setSize(currentWidth, 64);  // Header height
      isMinimized = true;
    }
    
    overlayWindow.webContents.send('toggle-minimize', isMinimized);
  }
});
```

**Renderer Response:**
```javascript
require('electron').ipcRenderer.on('toggle-minimize', (event, isMinimized) => {
  document.body.classList.toggle('minimized', isMinimized);
  document.querySelector('.hide-btn').textContent = isMinimized ? 'Show' : 'Hide';
});
```

#### 3.3.5 `end-session`

**Purpose:** Closes the overlay window and cleans up resources.

**Implementation:**
```javascript
ipcMain.on('end-session', () => {
  if (overlayWindow) {
    overlayWindow.close();
  }
});
```

**Renderer Usage:**
```javascript
// After finalizing session data
require('electron').ipcRenderer.send('end-session');
```

**Cleanup:**
The `overlayWindow.on('closed')` event handler (line 77) sets `overlayWindow = null` to allow garbage collection.

### 3.4 Global Keyboard Shortcuts

**Registration:** `main.js`, lines 376-406

| Shortcut | Action | IPC Channel | Renderer Handler |
|----------|--------|-------------|------------------|
| `Ctrl/Cmd+G` | Generate AI answer | `generate-response` | Clicks `#aiAnswerBtn` |
| `Ctrl/Cmd+K` | Analyze screen | `analyze-screen` | Clicks `#analyzeScreenBtn` |
| `Ctrl/Cmd+B` | Toggle hide/show | `toggle-hide` | Sends `hide-overlay` |
| `Ctrl/Cmd+Left` | Move overlay left | - | Calls `moveOverlay(-50, 0)` |
| `Ctrl/Cmd+Right` | Move overlay right | - | Calls `moveOverlay(50, 0)` |
| `Ctrl/Cmd+Up` | Move overlay up | - | Calls `moveOverlay(0, -50)` |
| `Ctrl/Cmd+Down` | Move overlay down | - | Calls `moveOverlay(0, 50)` |

**Registration Code:**
```javascript
function registerShortcuts() {
  globalShortcut.register('CommandOrControl+G', () => {
    if (overlayWindow) {
      overlayWindow.webContents.send('generate-response');
    }
  });
  
  // ... other shortcuts
}
```

**Note:** Shortcuts are registered in `app.whenReady()` and should be unregistered on app quit (currently not implemented, but Electron handles cleanup).

---

## 4. Audio & Screen Capture

### 4.1 Audio Capture Architecture

The application captures two audio sources simultaneously:
1. **Microphone** (user's voice)
2. **System Audio** (desktop audio, e.g., interviewer's voice from video call)

These are mixed using Web Audio API and sent to Deepgram for real-time transcription.

### 4.2 System Audio Capture

#### 4.2.1 Desktop Capturer API

**Main Process:** `main.js`, lines 255-272

```javascript
ipcMain.handle('get-desktop-sources', async () => {
  const { desktopCapturer } = require('electron');
  
  const sources = await desktopCapturer.getSources({
    types: ['screen'],  // Only screen sources (includes audio)
    thumbnailSize: { width: 1, height: 1 }  // Minimal, we only need IDs
  });
  
  return sources.map(source => ({
    id: source.id,
    name: source.name
  }));
});
```

**Renderer Process:** `overlay.html`, lines 1239-1278

```javascript
async function prepareSystemAudio() {
  try {
    // 1. Get desktop sources from main process
    const sources = await require('electron').ipcRenderer.invoke('get-desktop-sources');
    
    if (!sources || sources.length === 0) {
      console.log('⚠️ No desktop sources found');
      return;
    }
    
    // 2. Use primary source ID
    const primarySource = sources[0];
    
    // 3. Request media stream with desktop audio
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: primarySource.id
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: primarySource.id,
          maxWidth: 1,      // Minimal video (we only need audio)
          maxHeight: 1
        }
      }
    });
    
    // 4. Extract audio track only
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      systemAudioStream = new MediaStream([audioTrack]);
      console.log('✅ System audio prepared');
    }
    
    // 5. Stop video tracks (we don't need them)
    stream.getVideoTracks().forEach(track => track.stop());
    
  } catch (error) {
    console.warn('⚠️ System audio not available:', error.message);
  }
}
```

#### 4.2.2 Platform-Specific Behavior

**Windows:**
- System audio capture requires **Screen Recording** permission
- `setContentProtection(true)` on overlay window prevents it from appearing in its own capture
- Works with most applications (Chrome, Teams, Zoom, etc.)

**macOS:**
- Requires **Screen Recording** permission in System Preferences
- May require **Microphone** permission separately
- System audio capture is more reliable than Windows

**Linux:**
- Requires PulseAudio configuration
- May need `pactl` commands to set up loopback
- Less reliable than Windows/macOS

### 4.3 Microphone Capture

**Location:** `overlay.html`, lines 934-940

```javascript
const micStream = await navigator.mediaDevices.getUserMedia({ 
  audio: {
    echoCancellation: true,    // Reduces echo from speakers
    noiseSuppression: true,     // Reduces background noise
    autoGainControl: true       // Normalizes volume
  } 
});
microphoneStream = micStream;
```

**Audio Constraints:**
- `echoCancellation`: Prevents feedback from system audio
- `noiseSuppression`: Filters out background noise
- `autoGainControl`: Maintains consistent volume levels

### 4.4 Audio Mixing (Web Audio API)

**Location:** `overlay.html`, lines 1194-1233

#### Step-by-Step Process:

1. **Create Audio Context:**
   ```javascript
   audioContext = new AudioContext();
   const destination = audioContext.createMediaStreamDestination();
   ```

2. **Create Source Nodes:**
   ```javascript
   micSourceNode = audioContext.createMediaStreamSource(microphoneStream);
   systemSourceNode = audioContext.createMediaStreamSource(systemAudioStream);
   ```

3. **Create Gain Nodes (for volume control):**
   ```javascript
   gainNodes.mic = audioContext.createGain();
   gainNodes.system = audioContext.createGain();
   
   gainNodes.mic.gain.value = micEnabled ? 1 : 0;
   gainNodes.system.gain.value = speakerEnabled ? 1 : 0;
   ```

4. **Connect Audio Graph:**
   ```
   micSourceNode → gainNodes.mic → destination
   systemSourceNode → gainNodes.system → destination
   ```

5. **Create MediaRecorder:**
   ```javascript
   const mediaRecorder = new MediaRecorder(destination.stream, {
     mimeType: 'audio/webm;codecs=opus'
   });
   ```

6. **Send Audio Chunks to Deepgram:**
   ```javascript
   mediaRecorder.ondataavailable = (event) => {
     if (event.data.size > 0 && deepgramConnection && deepgramConnection.getReadyState() === 1) {
       deepgramConnection.send(event.data);
     }
   };
   
   mediaRecorder.start(250);  // Send chunk every 250ms
   ```

### 4.5 Audio Toggle Mechanism

**Location:** `overlay.html`, lines 1362-1378

When user clicks microphone or speaker toggle buttons:

```javascript
function toggleAudioSource(source, enabled) {
  if (!audioContext) return;
  
  if (source === 'microphone') {
    if (micSourceNode && gainNodes.mic) {
      gainNodes.mic.gain.value = enabled ? 1 : 0;  // Mute/unmute
    }
  } else if (source === 'system') {
    if (systemSourceNode && gainNodes.system) {
      gainNodes.system.gain.value = enabled ? 1 : 0;
    }
  }
}
```

**Important:** Audio streams are **not stopped** when toggled off. Only the gain is set to 0. This allows instant re-enabling without re-initializing streams.

### 4.6 Deepgram Integration

**Location:** `overlay.html`, lines 1125-1191

#### Connection Flow:

1. **Wait for Token:**
   ```javascript
   require('electron').ipcRenderer.on('deepgram-token', async (event, data) => {
     const audioReady = await audioPreparationPromise;  // Wait for audio setup
   ```

2. **Create Deepgram Client:**
   ```javascript
   const deepgram = createClient(data.token);
   deepgramConnection = deepgram.listen.live({
     model: 'nova-2',
     language: data.language,
     smart_format: true,      // Adds punctuation, capitalization
     interim_results: true    // Returns partial transcripts
   });
   ```

3. **Handle Connection Events:**
   ```javascript
   deepgramConnection.on(LiveTranscriptionEvents.Open, async () => {
     isCapturing = true;
     await startCombinedAudioFast();  // Start recording after connection
   });
   
   deepgramConnection.on(LiveTranscriptionEvents.Transcript, (transcriptData) => {
     const transcriptText = transcriptData.channel.alternatives[0].transcript;
     
     if (transcriptData.is_final) {
       accumulatedTranscript += transcriptText;
     } else {
       // Show interim result in gray
     }
   });
   ```

4. **Send Audio Data:**
   - MediaRecorder sends chunks every 250ms
   - Each chunk is sent via `deepgramConnection.send(event.data)`
   - Deepgram processes and returns transcripts in real-time

### 4.7 Screen Capture (Screenshot)

**Purpose:** Capture screen for AI visual analysis.

**Main Process:** `main.js`, lines 430-459

```javascript
ipcMain.handle('capture-screenshot', async () => {
  const { screen } = require('electron');
  const { desktopCapturer } = require('electron');
  
  // Get screen sources at full resolution
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: screen.getPrimaryDisplay().size  // Full screen size
  });
  
  const primarySource = sources[0];
  const screenshot = primarySource.thumbnail.toDataURL();  // PNG data URL
  
  // Return base64 without data URL prefix
  const base64Data = screenshot.replace(/^data:image\/png;base64,/, '');
  return base64Data;
});
```

**Renderer Usage:** `overlay.html`, lines 709-817

```javascript
// 1. Capture screenshot
const screenshotBase64 = await require('electron').ipcRenderer.invoke('capture-screenshot');

// 2. Send to backend API
messages.push({
  role: 'user',
  content: "The interviewer is sharing their screen. Analyze the screen and provide a useful response.",
  data: {
    task: 'analyze-screen',
    imageUrl: `data:image/png;base64,${screenshotBase64}`
  }
});

// 3. Stream response from backend
const response = await fetch(`${API_URL}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages, resumeString, interviewSessionId: sessionId })
});
```

### 4.8 Audio Cleanup

**Location:** `overlay.html`, lines 1329-1360

When session ends or audio capture stops:

```javascript
function stopAudioCapture() {
  // 1. Stop MediaRecorder
  if (combinedRecorder) {
    combinedRecorder.stop();
    combinedRecorder = null;
  }
  
  // 2. Disconnect audio nodes
  micSourceNode = null;
  systemSourceNode = null;
  gainNodes = { mic: null, system: null };
  
  // 3. Close AudioContext
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  
  // 4. Close Deepgram connection
  if (deepgramConnection) {
    deepgramConnection.finish();
    deepgramConnection = null;
  }
  
  // 5. Stop media tracks
  if (microphoneStream) {
    microphoneStream.getTracks().forEach(track => track.stop());
    microphoneStream = null;
  }
  
  if (systemAudioStream) {
    systemAudioStream.getTracks().forEach(track => track.stop());
    systemAudioStream = null;
  }
  
  isCapturing = false;
}
```

**Important:** Always call `stopAudioCapture()` to prevent memory leaks and ensure proper resource cleanup.

---

## 5. Build & Release Process

### 5.1 Electron Builder Configuration

**Location:** `package.json`, lines 14-67

#### Base Configuration:

```json
{
  "build": {
    "appId": "com.interviewsai.desktop",
    "productName": "InterviewsAI",
    "files": [
      "main.js",
      "preload.js",
      "overlay.html",
      "logo.png",
      "package.json"
    ]
  }
}
```

**Key Fields:**
- `appId`: Unique identifier for the application (reverse domain notation)
- `productName`: Display name shown to users
- `files`: Whitelist of files to include in the build (everything else is excluded)

### 5.2 macOS Build Configuration

**Location:** `package.json`, lines 24-35

```json
{
  "mac": {
    "category": "public.app-category.productivity",
    "target": [
      {
        "target": "dmg",
        "arch": ["x64", "arm64"]  // Universal binary (Intel + Apple Silicon)
      }
    ],
    "icon": "logo.png",
    "darkModeSupport": true,
    "artifactName": "InterviewsAI-Mac-${version}-${arch}.${ext}"
  }
}
```

**DMG Configuration:** `package.json`, lines 46-60

```json
{
  "dmg": {
    "contents": [
      {
        "x": 130,
        "y": 220,
        "type": "file"
      },
      {
        "x": 410,
        "y": 220,
        "type": "link",
        "path": "/Applications"
      }
    ],
    "artifactName": "InterviewsAI-Mac-${version}.${ext}"
  }
}
```

**Build Commands:**
```bash
# Build for macOS (both architectures)
npm run build:mac

# Output:
# - dist/InterviewsAI-Mac-1.0.1-x64.dmg
# - dist/InterviewsAI-Mac-1.0.1-arm64.dmg
```

**DMG Layout:**
- Application icon at (130, 220)
- Applications folder shortcut at (410, 220)
- Users drag app to Applications folder to install

### 5.3 Windows Build Configuration

**Location:** `package.json`, lines 36-45

```json
{
  "win": {
    "target": [
      {
        "target": "nsis",
        "arch": ["x64"]
      }
    ],
    "icon": "logo.png",
    "artifactName": "InterviewsAI-Windows-${version}.${ext}"
  }
}
```

**NSIS Installer Configuration:** `package.json`, lines 61-67

```json
{
  "nsis": {
    "oneClick": false,  // Show installer UI (not silent)
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "artifactName": "InterviewsAI-Windows-${version}.${ext}"
  }
}
```

**Build Commands:**
```bash
# Build for Windows
npm run build:win

# Output:
# - dist/InterviewsAI-Windows-1.0.1.exe
```

**NSIS Installer Features:**
- Custom installation directory selection
- Desktop shortcut creation
- Start menu shortcut creation
- Uninstaller included

### 5.4 Code Signing & Notarization

#### macOS Code Signing

**Requirements:**
- Apple Developer account
- Code signing certificate
- Notarization credentials

**Configuration (not in current package.json, but required for distribution):**

```json
{
  "mac": {
    "identity": "Developer ID Application: Your Name (TEAM_ID)",
    "hardenedRuntime": true,
    "gatekeeperAssess": false,
    "entitlements": "entitlements.mac.plist",
    "entitlementsInherit": "entitlements.mac.plist"
  }
}
```

**Notarization:**
```json
{
  "afterSign": "scripts/notarize.js"
}
```

**Notarization Script Example:**
```javascript
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;
  
  const appName = context.packager.appInfo.productFilename;
  
  return await notarize({
    appBundleId: 'com.interviewsai.desktop',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID
  });
};
```

#### Windows Code Signing

**Requirements:**
- Code signing certificate (.p12 or .pfx file)
- Certificate password

**Configuration:**
```json
{
  "win": {
    "certificateFile": "path/to/certificate.pfx",
    "certificatePassword": "password"
  }
}
```

**Or via Environment Variables:**
```bash
CSC_LINK=path/to/certificate.pfx
CSC_KEY_PASSWORD=password
```

### 5.5 Build Process Workflow

#### Development Build:
```bash
npm start
```
- Runs Electron in development mode
- Loads `main.js` directly
- Opens DevTools automatically
- No code signing/notarization

#### Production Build:
```bash
# macOS
npm run build:mac

# Windows
npm run build:win

# Auto-detect platform
npm run build
```

**Build Steps:**
1. **Dependency Resolution:** Electron Builder resolves all dependencies
2. **File Packaging:** Copies files from `files` array into app bundle
3. **Code Signing:** Signs binaries (if configured)
4. **Installer Creation:** Creates DMG (macOS) or NSIS installer (Windows)
5. **Notarization:** Submits to Apple (macOS only, if configured)
6. **Output:** Creates installer in `dist/` directory

### 5.6 Environment Variables

**Production API URL:**
```javascript
// main.js, lines 108-110
const API_URL = process.env.NODE_ENV === 'production' 
  ? 'https://interviewai-pro-production.up.railway.app'
  : 'http://localhost:5000';
```

**Setting for Build:**
```bash
# macOS
NODE_ENV=production npm run build:mac

# Windows
set NODE_ENV=production && npm run build:win
```

**Or via `.env` file:**
```
NODE_ENV=production
API_URL=https://interviewai-pro-production.up.railway.app
```

### 5.7 Distribution Checklist

#### Pre-Build:
- [ ] Update version in `package.json`
- [ ] Test deep link registration
- [ ] Verify all dependencies are listed
- [ ] Check icon file exists (`logo.png`)
- [ ] Set `NODE_ENV=production`

#### macOS:
- [ ] Code signing certificate installed
- [ ] Notarization credentials configured
- [ ] Test on Intel Mac (x64)
- [ ] Test on Apple Silicon Mac (arm64)
- [ ] Verify DMG opens and installs correctly
- [ ] Test deep link after installation

#### Windows:
- [ ] Code signing certificate configured (optional but recommended)
- [ ] Test on Windows 10/11
- [ ] Verify NSIS installer works
- [ ] Test deep link after installation
- [ ] Verify registry entries created

#### Post-Build:
- [ ] Test installer on clean system
- [ ] Verify all features work
- [ ] Check console for errors
- [ ] Test audio capture permissions
- [ ] Test screen capture permissions

---

## 6. Troubleshooting Guide

### 6.1 Permission Issues

#### macOS: Screen Recording Permission

**Symptom:** System audio capture fails, error: "Failed to get desktop sources"

**Solution:**
1. Open **System Preferences** → **Security & Privacy** → **Privacy** → **Screen Recording**
2. Check box next to "InterviewsAI" or "Electron"
3. Restart the application

**Code Check:**
```javascript
// overlay.html, line 1276
catch (error) {
  console.warn('⚠️ System audio not available:', error.message);
}
```

#### macOS: Microphone Permission

**Symptom:** Microphone capture fails, error: "getUserMedia() failed"

**Solution:**
1. Open **System Preferences** → **Security & Privacy** → **Privacy** → **Microphone**
2. Check box next to "InterviewsAI" or "Electron"
3. Restart the application

**Code Check:**
```javascript
// overlay.html, line 946
catch (error) {
  console.error('❌ Failed to prepare audio:', error);
}
```

#### Windows: Screen Recording Permission

**Symptom:** System audio not captured, or overlay appears in its own capture

**Solution:**
1. Ensure `setContentProtection(true)` is set (line 65 in `main.js`)
2. Grant screen recording permission if Windows prompts
3. For some apps (Teams, Zoom), may need to enable "Share system audio" in app settings

**Code Check:**
```javascript
// main.js, lines 64-66
if (process.platform === 'win32') {
  overlayWindow.setContentProtection(true);
}
```

### 6.2 Deep Link Issues

#### Deep Link Not Triggering

**Symptom:** Clicking `interviewsai://` link does nothing

**Windows Debugging:**
```powershell
# Check registry entry
reg query "HKCU\Software\Classes\interviewsai"

# Test manually
start interviewsai://session/test

# Check if app is running
Get-Process | Where-Object {$_.ProcessName -like "*electron*"}
```

**macOS Debugging:**
```bash
# Check Info.plist (after build)
plutil -p "/Applications/InterviewsAI.app/Contents/Info.plist" | grep -A 10 CFBundleURLTypes

# Test manually
open "interviewsai://session/test"
```

**Common Causes:**
1. Protocol not registered (run app once after installation)
2. App not running (Windows requires app to be running for `second-instance` event)
3. URL encoding issues (ensure settings JSON is properly encoded)

**Fix:**
```javascript
// Ensure protocol is registered on app start
app.setAsDefaultProtocolClient('interviewsai');
```

#### Deep Link Parsing Errors

**Symptom:** Overlay opens but session data is missing

**Debug:**
```javascript
// main.js, line 84
console.log('🔗 Deep link received:', url);

// Check regex match
const match = url.match(/interviewsai:\/\/session\/([^?]+)(?:\?settings=(.+))?/);
console.log('Match:', match);

// Check settings parsing
try {
  settings = JSON.parse(decodeURIComponent(encodedSettings));
} catch (error) {
  console.error('❌ Failed to parse settings:', error);
}
```

**Common Issues:**
- URL not properly encoded (use `encodeURIComponent()`)
- JSON syntax errors in settings
- Missing `sessionId` or `settings` parameter

### 6.3 WebSocket Connection Issues

#### Deepgram Connection Fails

**Symptom:** "Deepgram error" in console, no transcripts

**Debug:**
```javascript
// overlay.html, line 1175
deepgramConnection.on(LiveTranscriptionEvents.Error, (err) => {
  console.error('❌ Deepgram error:', err);
});
```

**Common Causes:**
1. **Invalid Token:** Token expired or incorrect
2. **Network Issues:** Firewall blocking WebSocket connection
3. **Audio Not Ready:** Connection opened before audio streams prepared

**Fix:**
```javascript
// Ensure audio is ready before connecting
const audioReady = await audioPreparationPromise;
if (!audioReady) {
  throw new Error('Audio preparation failed');
}
```

#### Token Expiration

**Symptom:** Connection works initially, then fails after some time

**Current Behavior:** Token is fetched once at session start. No automatic refresh.

**Potential Fix (not implemented):**
```javascript
// Monitor connection close events
deepgramConnection.on(LiveTranscriptionEvents.Close, () => {
  // Re-fetch token and reconnect
  fetchNewTokenAndReconnect();
});
```

### 6.4 Audio Capture Issues

#### System Audio Not Captured

**Symptom:** Only microphone audio is transcribed

**Debug:**
```javascript
// overlay.html, line 1246
const audioTrack = stream.getAudioTracks()[0];
if (!audioTrack) {
  console.warn('⚠️ No audio track in system stream');
}
```

**Common Causes:**
1. **Permission Denied:** Screen recording permission not granted
2. **Platform Limitation:** Linux may not support system audio capture
3. **Application Limitation:** Some apps don't allow audio capture

**Fix:**
- Grant screen recording permission
- On Windows, ensure app has proper permissions
- Test with different applications (Chrome, Teams, etc.)

#### Audio Mixing Issues

**Symptom:** One audio source is too loud or too quiet

**Debug:**
```javascript
// overlay.html, lines 1201-1209
gainNodes.mic.gain.value = micEnabled ? 1 : 0;
gainNodes.system.gain.value = speakerEnabled ? 1 : 0;
```

**Fix:**
Adjust gain values (currently fixed at 1.0):
```javascript
gainNodes.mic.gain.value = micEnabled ? 0.8 : 0;  // Reduce mic volume
gainNodes.system.gain.value = speakerEnabled ? 1.2 : 0;  // Increase system volume
```

#### Echo/Feedback

**Symptom:** Audio feedback or echo in transcription

**Cause:** System audio includes microphone output (feedback loop)

**Fix:**
- Ensure `echoCancellation: true` in microphone constraints (line 936)
- Reduce system audio gain if microphone is too sensitive
- Use headphones to prevent feedback

### 6.5 Overlay Display Issues

#### Overlay Not Visible

**Symptom:** Overlay window created but not visible

**Debug:**
```javascript
// main.js, line 70
overlayWindow.once('ready-to-show', () => {
  const display = require('electron').screen.getPrimaryDisplay();
  const { width: screenWidth } = display.workArea;
  overlayWindow.setPosition(Math.floor(screenWidth / 2) - 200, 1);
  overlayWindow.show();  // ← Ensure this is called
});
```

**Common Causes:**
1. Window positioned off-screen
2. `alwaysOnTop` not working (permission issue)
3. Window minimized or hidden

**Fix:**
```javascript
overlayWindow.show();
overlayWindow.focus();
```

#### Overlay Not Clickable

**Symptom:** Overlay visible but buttons don't respond

**Debug:**
```javascript
// Check mouse passthrough state
// overlay.html, line 1000
require('electron').ipcRenderer.send('set-ignore-mouse-events', false);
```

**Common Causes:**
1. `setIgnoreMouseEvents(true)` stuck (mouse passthrough enabled)
2. CSS `pointer-events: none` on body
3. Window not focused

**Fix:**
```javascript
// Force enable mouse events
overlayWindow.setIgnoreMouseEvents(false);
```

#### Overlay Appears in Screen Recordings

**Symptom:** Overlay visible in OBS, QuickTime, etc.

**Windows Fix:**
```javascript
// main.js, line 65
if (process.platform === 'win32') {
  overlayWindow.setContentProtection(true);
}
```

**Note:** This only works on Windows. macOS doesn't support content protection.

### 6.6 API Connection Issues

#### Backend API Unreachable

**Symptom:** "Failed to fetch" errors, session not starting

**Debug:**
```javascript
// main.js, line 108
const API_URL = process.env.NODE_ENV === 'production' 
  ? 'https://interviewai-pro-production.up.railway.app'
  : 'http://localhost:5000';
```

**Common Causes:**
1. Backend server not running (development)
2. Incorrect `API_URL` in production build
3. Network/firewall blocking requests
4. CORS issues (shouldn't happen with Electron)

**Fix:**
- Verify backend is running: `curl http://localhost:5000/api/health`
- Check `NODE_ENV` environment variable
- Verify production URL is correct
- Check network connectivity

#### Auto-Save Failing

**Symptom:** Session data not saving, console errors

**Debug:**
```javascript
// overlay.html, line 605
catch (error) {
  console.error('❌ Auto-save failed:', error);
}
```

**Common Causes:**
1. `sessionId` not set (check line 910)
2. Backend API returning errors
3. Network issues

**Fix:**
```javascript
// Ensure sessionId is set before auto-save
if (sessionId && conversation.length > 0) {
  // Proceed with auto-save
}
```

### 6.7 Build Issues

#### Build Fails with "File Not Found"

**Symptom:** `electron-builder` fails to find files

**Fix:**
```json
// package.json, ensure all required files are listed
{
  "files": [
    "main.js",
    "preload.js",
    "overlay.html",
    "logo.png",
    "package.json"
  ]
}
```

#### macOS Notarization Fails

**Symptom:** Notarization submission fails

**Common Causes:**
1. Invalid Apple ID credentials
2. Missing entitlements
3. Code signing issues

**Fix:**
- Verify credentials in environment variables
- Check entitlements file includes required permissions
- Ensure code signing certificate is valid

#### Windows Installer Doesn't Create Shortcuts

**Symptom:** Desktop/Start menu shortcuts missing

**Fix:**
```json
// package.json
{
  "nsis": {
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true
  }
}
```

### 6.8 Performance Issues

#### High CPU Usage

**Symptom:** Application uses excessive CPU

**Common Causes:**
1. Audio processing (MediaRecorder + Deepgram)
2. Frequent DOM updates (transcript updates)
3. Auto-save interval too frequent

**Optimization:**
```javascript
// Reduce auto-save frequency (currently 5000ms)
window.autoSaveInterval = setInterval(async () => {
  // ...
}, 10000);  // Increase to 10 seconds
```

#### Memory Leaks

**Symptom:** Memory usage increases over time

**Fix:**
- Ensure `stopAudioCapture()` is called on session end
- Clear intervals on cleanup:
  ```javascript
  clearInterval(window.autoSaveInterval);
  ```
- Remove event listeners when not needed

---

## Appendix A: File Structure

```
interviewai-desktop/
├── main.js                    # Main process (Electron backend)
├── preload.js                 # IPC bridge (minimal)
├── overlay.html               # Renderer process (UI + logic)
├── logo.png                   # Application icon
├── package.json               # Dependencies + build config
├── package-lock.json          # Dependency lock file
├── dist/                      # Build output directory
│   ├── InterviewsAI-Mac-*.dmg
│   └── InterviewsAI-Windows-*.exe
└── node_modules/             # Dependencies
```

## Appendix B: Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `electron` | ^38.2.2 | Electron framework |
| `electron-builder` | ^25.1.8 | Build and packaging |
| `@deepgram/sdk` | ^4.11.2 | Real-time transcription |
| `electron-squirrel-startup` | ^1.0.1 | Windows installer integration |

## Appendix C: Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `API_URL` | Backend API URL | `http://localhost:5000` (dev) or production URL |

## Appendix D: API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/sessions/start` | POST | Start session, deduct credit |
| `/api/sessions/:id` | PUT | Update session (auto-save, finalize) |
| `/api/sessions/:userId` | GET | Get user's sessions (timer restore) |
| `/api/deepgram-token` | POST | Get Deepgram API token |
| `/api/chat` | POST | Get AI response (streaming) |
| `/resumes/:id` | GET | Get resume content |

---

**Document Version:** 1.0  
**Last Updated:** 2025  
**Maintained By:** Development Team

For questions or updates, refer to the codebase or contact the development team.

