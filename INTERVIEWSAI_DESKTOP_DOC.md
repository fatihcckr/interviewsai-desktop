# InterviewsAI Desktop – Tekil Geliştirici Dokümanı

Bu belge, InterviewsAI Desktop overlay uygulamasını geliştirecek veya bakımını üstlenecek herkes için **tek kaynaktan** tüm gereksinimleri açıklar. Amaç; projeyi, mimari kararları, servis entegrasyonlarını, ses/ekran işleme zincirini, paketlemeyi ve yaygın sorunları tek dokümanda toplamaktır.

---

## 1. Ürün Özeti ve Kullanım Senaryosu
- Web tabanlı InterviewsAI hizmeti bir oturum başlattığında, masaüstü uygulaması deep link üzerinden tetiklenir.
- Electron tabanlı overlay hem mikrofonu hem sistem sesini dinler, Deepgram üzerinden gerçek zamanlı transkript üretir.
- Kullanıcı; gelen soruya göre `Generate Answer`, ekran paylaşımı varsa `Analyze Screen` veya manuel prompt akışını kullanarak backend AI servisinden stream cevap alır.
- Oturum süresince transcript, chat ve timer verileri otomatik olarak backend’e yazılır, oturum bitiminde finalize edilir.

---

## 2. Mimari Genel Bakış
```
┌────────────────────────────────────────────┐
│            Ana (Main) Süreç - main.js      │
│  • Uygulama ömrü ve pencere yönetimi       │
│  • Deep link protokolü & session bootstrap │
│  • IPC handler’ları, klavye kısayolları    │
│  • Sistem API’leri (screenshot, desktop audio)│
└──────────────────────────────┬─────────────┘
                               │ IPC + preload köprüsü
┌───────────────────────────────▼────────────────────────┐
│      Renderer Süreci - overlay.html (+ inline JS)      │
│  • UI/UX (overlay, controls, content alanı)            │
│  • Audio kaynak hazırlığı + Web Audio miksleme         │
│  • Deepgram SDK ile canlı transkripsiyon               │
│  • Backend API çağrıları (chat, resume, session)       │
│  • Auto-save & session lifecycle                       │
└────────────────────────────────────────────────────────┘
```
`preload.js` minimum bir köprü sunar (context isolation kapalı olsa da API yüzeyini sabitler).

---

## 3. Dosya Bazında Sorumluluklar
| Dosya | Görevler |
| --- | --- |
| `main.js` | Deep link kaydı (`interviewsai://`), `BrowserWindow` konfigleri, overlay konumu, globalShortcut seti (`Ctrl/Cmd + G/K/B`, ok tuşları), IPC handler’ları (`get-desktop-sources`, `capture-screenshot`, `hide-overlay`, `end-session`, `stop-listening`). Session bootstrap sırasında backend’e `/api/sessions/start`, `/api/deepgram-token`, gerekirse `/resumes/:id` çağrıları yapar ve sonuçları renderer’a enjekte eder. |
| `overlay.html` | Tüm UI + iş mantığı tek dosyada: header kontrolleri, dinleme paneli, content balonları, aksiyon butonları, manuel input. Audio hazırlığı (mikrofon + sistem), Deepgram canlı bağlantısı, API streaming okumaları, konuşma geçmişi ve navigasyon, font zoom, auto-save döngüsü. |
| `preload.js` | Renderer’dan `set-ignore-mouse-events` gibi IPC fonksiyonlarına erişim ve placeholder `onDeepLink`. |
| `package.json` | Electron 38.2.2 + electron-builder 25.1.8; build hedefleri (mac dmg/x64+arm64, win nsis x64), dosya listeleri, ürün kimliği. |
| `API_INTEGRATION.md`, `DEVELOPER_GUIDE.md`, `README.md` | Yardımcı belgeler; bu yeni doküman hepsini kapsayan üst seviye kaynaktır. |

---

## 4. Uygulama Akış Adımları
1. **Deep link kaydı**: Uygulama kurulduğunda `app.setAsDefaultProtocolClient('interviewsai')` ile OS seviyesinde protokol kaydı yapılır.
2. **Oturum tetikleme**: Web uygulaması `interviewsai://session/{id}?settings={encodeURIComponent(JSON)}` çağırır.
3. **Session bootstrap** (`handleDeepLink`):
   - `sessionId` ve `settings` parse edilir.
   - Overlay yoksa `createOverlayWindow()` çağrılır; HTML yüklenince `window.electronSessionId` ve `window.electronSessionSettings` enjekte edilir.
   - Settings içindeki `userId` ile `/api/sessions/start` çağrısı yapılır; kredi düşülür ve backend’in döndürdüğü gerçek session ID overlay’e geri yazılır.
   - Eğer resume içeriği eksikse `/resumes/:id` çağrısıyla doldurulur.
   - Deepgram token’ı (`/api/deepgram-token`) alınıp renderer’a IPC ile gönderilir.
4. **Overlay initialization**:
   - Timer, auto-save ve UI event’leri başlar.
   - Audio hazırlığı (system + mic) token bağımsız başlatılır; token gelince Deepgram websocket’i açılır.
5. **Kullanıcı etkileşimi**:
   - `Ctrl/Cmd+G` veya buton -> `/api/chat` streaming cevabı.
   - `Ctrl/Cmd+K` -> screenshot al, aynı chat endpoint’ine görsel data ile gönder.
   - Manuel input -> aynı pipeline.
6. **Auto-save**: Her 5 saniyede (yorum 10sn, kod 5000ms) session API’sine `PUT /api/sessions/{id}` ile `chat`, `transcript`, `duration`, `status: In Progress` yazılır.
7. **Session kapatma**: `End Session` butonu confirm sonrası:
   - Auto-save interval temizlenir.
   - Son `PUT` çağrısı `status: Completed` ve cache-control header’larıyla yapılır.
   - `end-session` IPC ile overlay kapatılır, window cleanup loglanır.

---

## 5. Backend ve API Entegrasyon Detayı
### Ortam Seçimi
```js
const API_URL = process.env.NODE_ENV === 'production'
  ? 'https://interviewai-pro-production.up.railway.app'
  : 'http://localhost:5000';
```
`NODE_ENV` ve olası `API_URL` override’ı (örn. `.env`) üretim paketleri için zorunludur.

### Kullanılan Endpoint’ler
| Endpoint | Kullanım Noktası | Amaç |
| --- | --- | --- |
| `POST /api/sessions/start` | `main.js` deep link akışı | Session kaydı, kredi düşümü, backend ID edinimi |
| `PUT /api/sessions/:id` | Overlay auto-save + session end | Chat transcript’i, süre, status güncellemesi |
| `GET /api/sessions/:userId` | Session restore (timer) | Var olan session süresini hesaplayıp timer’a yansıtma |
| `POST /api/deepgram-token` | Token yenileme | Deepgram WebSocket oturumu için kısa ömürlü token |
| `POST /api/chat` | AI yanıt & ekran analizi | Stream (Server-Sent `0:"..."` formatı) |
| `GET /resumes/:id` | Resume yükleme | `settings.selectedResume` içeriğini doldurma |

### Streaming Yanıt Parsingi
Renderer tarafında her satır `0:"chunk"` formatıyla gelir; kaçış karakterleri temizlenip `<pre><code>` blokları oluşturulur, Markdown benzeri vurgu `<strong>` ile dönüştürülür.

---

## 6. Overlay UI ve Etkileşimler
- **Header**: Logo, `Hide/Show`, timer, hoparlör/mikrofon toggle (görsel indicator), `End Session`.
- **Listening Marquee**: Deepgram’dan gelen final ve interim transcript’i gösterir, her değişimde scroll’u sona taşır.
- **Content Bölümü**:
  - `question` ve `answer` balonları; font büyüklüğü `zoomLevel` göstergesiyle ayarlanır (14px = %100).
  - `conversation-nav` ile çiftler arasında gezinebilme.
- **Actions**:
  - `Generate Answer (Ctrl/Cmd+G)` -> transcript veya manuel input’tan soru üretir.
  - `Analyze Screen (Ctrl/Cmd+K)` -> screenshot alıp AI’a gönderir.
- **Manual Input**: Textbox (boşken disable), `Send` butonu chat pipeline’ına bağlı.
- **Minimize/Gizle**: `Hide` overlay’i 64px header’a indirir; `hide-overlay` IPC ile ana süreç boyut/pozisyonu kaydeder ve restore eder.
- **Pointer yönetimi**: `setIgnoreMouseEvents` ile overlay “tıklanamaz” halde durur, UI elemanları üzerinde fare varsa etkileşim açılır.

---

## 7. Ses ve Transkripsiyon Zinciri
1. **Audio hazırlığı**:
   - `prepareSystemAudio()` IPC üzerinden `desktopCapturer` kaynak ID’sini alıp `navigator.mediaDevices.getUserMedia` ile sistem sesini çeker (Windows’ta içerik koruması açık).
   - Mikrofon için echo cancellation, noise suppression, auto gain seçenekleri açık.
2. **Beklenen durum**: Deepgram token gelmeden audio stream’leri hazır hale getirilir; `audioPreparationPromise` ile senkronizasyon yapılır.
3. **Deepgram canlı bağlantısı**:
   ```js
   const deepgram = createClient(token);
   const connection = deepgram.listen.live({
     model: 'nova-2',
     language,
     smart_format: true,
     interim_results: true,
   });
   ```
4. **Recorder başlatma**: `LiveTranscriptionEvents.Open` tetiklendiğinde `startCombinedAudioFast()` çağrılır; Web Audio API ile mic + system kaynakları `AudioContext` içinde gain düğümleri üzerinden mikslenip `MediaRecorder`’a verilir. Recorder her 250 ms blob gönderir.
5. **Toggle mantığı**: Hoparlör/mikrofon butonları `gainNodes.mic/system` değerlerini 0/1 yaparak devre dışı bırakır; stream’ler kesilmez.
6. **Auto-save transcript**: `conversation` dizisi `question_summary` ve `ai` objeleriyle dolar; transcript string’i final soruların `rawText` alanından üretilir.
7. **Temizlik**: `stopAudioCapture()` recorder’ı, audio context’i, stream’leri ve Deepgram bağlantısını kapatır; session kapanışında mutlaka çağrılır.

---

## 8. Oturum ve Durum Yönetimi
- **Timer restore**: Deep link ile gelen `sessionId` backend’de varsa süre `duration` formatından milisaniyeye çevrilip `window.sessionStartTime` olarak overlay’e enjekte edilir, timer bu değerden devam eder.
- **Auto-save interval**: `window.autoSaveInterval` 5000 ms; session yoksa veya konuşma kaydı boşsa çağrı yapılmaz.
- **Credit consumption**: `/api/sessions/start` başarılı olursa backend’in verdiği `session.id` DOM’a tekrar yazılır; bundan sonra tüm `PUT` ve chat çağrıları bu ID üzerinden gider.
- **Resume update**: Eğer resume content sonradan yüklendiyse overlay’de `window.electronSessionSettings.selectedResume` güncellenir; UI bu referansı kullanır.
- **End session**: Kullanıcı onayından sonra final `PUT` (status `Completed`) yapılır; sonrasında overlay `end-session` IPC ile kapanır ve `overlayWindow.on('closed')` log’u işler.

---

## 9. Ekran Analizi ve Screenshot Süreci
1. Renderer `ipcRenderer.invoke('capture-screenshot')` çağırır.
2. Main süreç `desktopCapturer.getSources({ types: ['screen'], thumbnailSize: screen.getPrimaryDisplay().size })` ile ekran görüntüsünü DataURL olarak döner.
3. Renderer base64 string’i `data:image/png;base64,...` formatında `/api/chat` çağrısındaki `messages[].data.imageUrl` alanına koyar, `task: 'analyze-screen'`.
4. Aynı streaming parsing pipeline UI’da gösterimi günceller ve `conversation` dizisine kaydeder.

---

## 10. IPC, Global Kısayollar ve Mouse Yönetimi
- **Global shortcuts** (`registerShortcuts`):
  - `Ctrl/Cmd+G` → `generate-response`
  - `Ctrl/Cmd+K` → `analyze-screen`
  - `Ctrl/Cmd+B` → `toggle-hide`
  - `Ctrl/Cmd+Arrow` → `moveOverlay(±50px)`
- **IPC kanalları**:
  - `deepgram-token` (main → renderer)
  - `set-ignore-mouse-events`, `hide-overlay`, `toggle-minimize`, `end-session`, `stop-audio-capture`
  - `get-desktop-sources`, `capture-screenshot` (renderer → main)
- **Mouse passthrough**: `overlayWindow.setIgnoreMouseEvents(true, { forward: true })`; renderer tarafında `mousemove` ile UI üzerinde olup olmadığına göre toggle edilir.

---

## 11. Çalıştırma, Build ve Dağıtım
### Geliştirme
```bash
npm install
npm start      # Electron .  (mainWindow DevTools açık gelir)
```
Geliştirme sırasında web uygulaması `http://localhost:5173` adresinden servis edilmelidir.

### Production Build
```bash
npm run build          # electron-builder, hedef platforma göre
npm run build:mac      # dmg (x64 + arm64)
npm run build:win      # nsis x64
```
`build.files` listesi overlay için gerekli tüm artefact’ları içerir; yeni dosyalar eklerseniz listeyi güncelleyin.

### Dağıtım Notları
- macOS için `darkModeSupport: true`, kategori `productivity`.
- Windows NSIS konfigürasyonu: `oneClick: false`, kurulumu kullanıcı seçer, masaüstü & Start menü kısayolu oluşturulur.
- Deep link çalışması için kurulum sonrası OS protokol kaydı otomatik yapılır; debug sırasında `electron .` ile test ederken `process.defaultApp` branch’i devreye girer.

---

## 12. Debugging ve Gözlemlenebilirlik
- **Log noktaları**:
  - Main: `[OVERLAY CONSOLE]`, `🔗 Deep link received`, `✅ Session started`, `🔴 Overlay closed`.
  - Renderer: `🎯 Overlay loaded`, `✅ Audio ready`, `❌ Generate answer error`.
- **DevTools**: `mainWindow.webContents.openDevTools()` varsayılan açık; overlay için ihtiyaca göre `overlayWindow.webContents.openDevTools()` ekleyebilirsiniz.
- **Hata senaryoları**:
  - API başarısızlıkları `console.error` ile loglanır; UI içinde kırmızı mesaj gösterilir.
  - Deepgram socket hataları `LiveTranscriptionEvents.Error` ile yazılır; token süresi dolduğunda yeniden token alma işlemi tetiklenmelidir (şu an manuel).

---

## 13. Sorun Giderme İpuçları
- **Sistem sesi gelmiyor**: `prepareSystemAudio()` desktop capture izni gerektirir; Windows’ta ekran korumayı kapatıp tekrar deneyin, macOS’ta Security & Privacy → Screen Recording izni verin.
- **Deep link tetiklenmiyor**: Kurulum sonrası `interviewsai://test` komut satırından çağrılıp console çıktısı izlenmeli. Windows’ta registry kaydı için uygulamayı bir kez admin olarak çalıştırmak gerekebilir.
- **Auto-save çağrıları yapılmıyor**: `sessionId` DOM’a yazılmadan önce API çağrıları atlanır. Main süreç loglarında `Session ID set` satırı aranmalı.
- **Streaming cevap kesiliyor**: Backend’in SSE formatı `0:""` satırlarını göndermezse parse işlemi durur; `lines.startsWith('0:"')` koşulunu backend ile uyumlu tutun.
- **Overlay etkileşimsiz kalıyor**: `setIgnoreMouseEvents` IPC’leri hatalıysa overlay tıklanamaz. Renderer konsolunda `Mouse event error` logunu kontrol edin.

---

## 14. Yeni Geliştirici İçin Kontrol Listesi
1. Node.js 18+ ve gerekli izinleri içeren OS ortamını hazırla.
2. `npm install`, ardından `npm start`; aynı anda web frontend’i `localhost:5173` üzerinde çalıştır.
3. Backend API’lerini (`localhost:5000`) erişilebilir hale getir; `.env` dosyanla `API_URL` ve `NODE_ENV` ayarını doğrula.
4. Deep link testini (terminalden `start interviewsai://session/test?settings=%7B...%7D`) yap ve overlay’in otomatik açıldığını gör.
5. Mikrofon + sistem seslerine OS izinleri ver; hoparlör/mikrofon toggle’larının gain’i değiştirdiğini doğrula.
6. `Generate Answer`, `Analyze Screen`, manuel mesaj ve global kısayolları test et.
7. Session kapanışının backend’de `Completed` olarak işaretlendiğini kontrol et.
8. Production build almak gerekiyorsa hedef OS için `npm run build:<platform>` komutunu çalıştır, çıkan `dist/` paketini kurup deep link ve izinleri tekrar test et.

---

Bu doküman güncel kod tabanına (Kasım 2025) göre hazırlanmıştır. Genişletilen modüller, yeni IPC kanalları veya ek dosyalar eklendiğinde lütfen bu belgeyi **tek kaynak** olarak güncel tutun.

