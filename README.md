# InterviewsAI Desktop Application

## 📋 Proje Özeti

InterviewsAI Desktop, mülakat sırasında gerçek zamanlı AI desteği sağlayan bir Electron masaüstü uygulamasıdır. Uygulama, hem mikrofon hem de sistem sesini dinleyerek mülakat sorularını transkript eder ve AI destekli yanıtlar üretir. Ayrıca ekran görüntüsü analizi yaparak görsel içerik hakkında da yorum yapabilir.

## 🚀 Özellikler

### Temel Özellikler
- **Gerçek Zamanlı Ses Transkripsiyonu**: Deepgram SDK kullanarak mikrofon ve sistem sesini dinler
- **AI Destekli Yanıt Üretimi**: Mülakat sorularına akıllı yanıtlar üretir
- **Ekran Analizi**: Ekran görüntüsü alarak görsel içerik hakkında yorum yapar
- **Overlay Arayüz**: Şeffaf, her zaman üstte duran overlay penceresi
- **Deep Link Desteği**: Web uygulamasından oturum başlatma
- **Klavye Kısayolları**: Hızlı erişim için global kısayollar

### Teknik Özellikler
- **Çoklu Ses Kaynağı**: Mikrofon + sistem sesi birlikte dinleme
- **Ses Kontrolü**: Mikrofon ve sistem sesini ayrı ayrı açıp kapatma
- **Minimize/Maximize**: Overlay'i küçültme ve büyütme
- **Sürükleme**: Overlay penceresini sürükleyerek konumlandırma
- **Otomatik Konumlandırma**: Ekranın ortasında başlatma

## 🛠️ Teknoloji Stack

- **Framework**: Electron 38.2.2
- **Ses İşleme**: Deepgram SDK 4.11.2
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Backend Entegrasyonu**: REST API (localhost:5000)
- **Platform Desteği**: Windows, macOS, Linux

## 📁 Proje Yapısı

```
interviewai-desktop/
├── main.js              # Ana Electron süreci
├── preload.js           # Güvenli API köprüsü
├── overlay.html         # Overlay arayüz dosyası
├── logo.png            # Uygulama logosu
├── package.json         # Proje bağımlılıkları
└── package-lock.json   # Bağımlılık kilidi
```

## 🔧 Kurulum

### Gereksinimler
- Node.js (v16 veya üzeri)
- npm veya yarn
- Mikrofon erişimi
- Sistem sesi erişimi (Windows için)

### Kurulum Adımları

1. **Projeyi klonlayın:**
```bash
git clone <repository-url>
cd interviewai-desktop
```

2. **Bağımlılıkları yükleyin:**
```bash
npm install
```

3. **Uygulamayı başlatın:**
```bash
npm start
```

## 🎯 Kullanım

### Başlatma
1. Uygulama başlatıldığında ana pencere `http://localhost:5173` adresini yükler
2. Overlay penceresi otomatik olarak oluşturulur ve ekranın ortasında konumlandırılır
3. Deep link ile gelen oturum verileri otomatik olarak yüklenir

### Deep Link Formatı
```
interviewsai://session/{sessionId}?settings={encodedSettings}
```

### Klavye Kısayolları
- `Ctrl+H`: AI yanıt üret
- `Ctrl+K`: Ekran analizi yap
- `Ctrl+B`: Overlay'i gizle/göster
- `Ctrl+Arrow Keys`: Overlay'i hareket ettir

### Overlay Kontrolleri
- **Mikrofon Butonu**: Mikrofon sesini aç/kapat
- **Hoparlör Butonu**: Sistem sesini aç/kapat
- **Hide Butonu**: Overlay'i minimize et
- **End Session**: Oturumu sonlandır
- **Generate Answer**: AI yanıt üret
- **Analyze Screen**: Ekran analizi yap

## 🔌 API Entegrasyonu

### Backend Endpoints
- `POST /api/deepgram-token`: Deepgram token al
- `POST /api/chat`: AI yanıt üret
- `GET /api/resumes/{id}`: CV içeriği al

### Environment Variables
```bash
NODE_ENV=production  # Production modu için
```

## 🎨 Arayüz Detayları

### Overlay Tasarımı
- **Şeffaf Arka Plan**: `rgba(26, 26, 26, 0.50)`
- **Modern UI**: Apple Design System benzeri
- **Responsive**: Farklı ekran boyutlarına uyum
- **Dark Theme**: Koyu tema ile göz yormayan tasarım

### Bileşenler
- **Header**: Logo, durum göstergesi, kontroller
- **Listening Status**: Gerçek zamanlı transkript gösterimi
- **Content Area**: Soru ve yanıt balonları
- **Actions**: AI yanıt ve ekran analizi butonları
- **Manual Input**: Manuel mesaj gönderme

## 🔧 Geliştirme

### Geliştirme Ortamı
```bash
# Development modunda çalıştır
npm start

# Debug modunda çalıştır
npm run dev
```

### Debugging
- Ana pencere otomatik olarak DevTools açar
- Console logları hem ana süreçte hem de renderer'da görüntülenir
- IPC mesajları detaylı olarak loglanır

### Yaygın Sorunlar

#### Ses Erişimi
- **Windows**: Sistem sesi için `setContentProtection(true)` gerekli
- **macOS**: Mikrofon izni gerekli
- **Linux**: PulseAudio yapılandırması gerekli

#### Deep Link
- **Windows**: Registry kaydı gerekli
- **macOS**: Info.plist yapılandırması gerekli

#### Overlay Konumlandırma
- Ekran sınırları otomatik kontrol edilir
- Çoklu monitör desteği mevcuttur

## 📱 Platform Desteği

### Windows
- ✅ Tam destek
- ✅ Sistem sesi yakalama
- ✅ Deep link desteği
- ✅ Global kısayollar

### macOS
- ✅ Tam destek
- ✅ Mikrofon erişimi
- ✅ Deep link desteği
- ✅ Global kısayollar

### Linux
- ⚠️ Kısmi destek
- ✅ Mikrofon erişimi
- ⚠️ Sistem sesi sınırlı
- ✅ Global kısayollar

## 🔒 Güvenlik

### İzinler
- Mikrofon erişimi
- Sistem sesi erişimi
- Ekran görüntüsü alma
- Ağ erişimi (API çağrıları)

### Veri Güvenliği
- Ses verileri sadece Deepgram'a gönderilir
- Yerel olarak ses kaydedilmez
- API token'ları güvenli şekilde yönetilir

## 🚀 Production Build

### Build Komutu
```bash
npm run build
```

### Distribution
```bash
npm run dist
```

### Environment Configuration
```bash
# Production için
NODE_ENV=production
API_URL=https://interviewai-pro-production.up.railway.app
```

## 📊 Performans

### Optimizasyonlar
- **Lazy Loading**: Session verileri ihtiyaç duyulduğunda yüklenir
- **Memory Management**: Audio stream'ler düzgün şekilde temizlenir
- **Efficient Rendering**: DOM manipülasyonları minimize edilir

### Kaynak Kullanımı
- **RAM**: ~100-200MB
- **CPU**: Düşük (sadece ses işleme sırasında)
- **Disk**: Minimal (sadece uygulama dosyaları)

## 🤝 Katkıda Bulunma

### Geliştirme Süreci
1. Fork yapın
2. Feature branch oluşturun
3. Değişikliklerinizi commit edin
4. Pull request gönderin

### Kod Standartları
- ESLint kullanın
- Prettier ile formatlayın
- Meaningful commit mesajları yazın
- Test coverage'ı koruyun

## 📄 Lisans

ISC License - Detaylar için `package.json` dosyasına bakın.

## 📞 Destek

### Sorun Bildirimi
- GitHub Issues kullanın
- Detaylı hata açıklaması yapın
- Log dosyalarını ekleyin

### İletişim
- Email: [destek@interviewai.com]
- GitHub: [repository-url]

---

**Not**: Bu uygulama mülakat sırasında destek amaçlıdır. Etik kurallara uygun şekilde kullanılmalıdır.
