# InterviewsAI Desktop - API Entegrasyon Rehberi

## 🔌 Backend API Entegrasyonu

### Genel Bakış
InterviewsAI Desktop uygulaması, web backend'i ile REST API üzerinden iletişim kurar. Tüm API çağrıları asenkron olarak yapılır ve hata yönetimi içerir.

## 🌐 API Endpoints

### 1. Deepgram Token Alma
**Endpoint:** `POST /api/deepgram-token`  
**Açıklama:** Gerçek zamanlı ses transkripsiyonu için Deepgram token'ı alır.

#### Request
```javascript
// main.js'de
const response = await fetch(`${API_URL}/api/deepgram-token`, { 
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
});
```

#### Response
```json
{
  "key": "deepgram_api_key_here",
  "expires_in": 3600
}
```

#### Kullanım
```javascript
// main.js'de token alma
ipcMain.on('start-listening', async (event, language) => {
  try {
    const API_URL = process.env.NODE_ENV === 'production' 
      ? 'https://interviewai-pro-production.up.railway.app'
      : 'http://localhost:5000';
    
    const response = await fetch(`${API_URL}/api/deepgram-token`, { 
      method: 'POST' 
    });
    
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
```

### 2. AI Chat API
**Endpoint:** `POST /api/chat`  
**Açıklama:** AI destekli yanıt üretimi için kullanılır.

#### Request Body
```json
{
  "messages": [
    {
      "role": "user",
      "content": "What is your experience with React?",
      "data": {
        "task": "analyze-screen",
        "imageUrl": "data:image/png;base64,..."
      }
    }
  ],
  "resumeString": "John Doe's resume content...",
  "interviewSessionId": "session_123",
  "customPrompt": "Additional instructions..."
}
```

#### Response (Streaming)
```
0:"Hello! I have extensive experience with React..."
0:"I've worked on various projects including..."
0:"Some key technologies I've used are..."
```

#### Kullanım
```javascript
// overlay.html'de AI yanıt üretimi
document.getElementById('aiAnswerBtn').addEventListener('click', async () => {
  const questionText = accumulatedTranscript.trim();
  
  if (!questionText) {
    alert('Please speak a question first!');
    return;
  }
  
  // Messages array oluştur
  const messages = conversation.map(turn => ({
    role: turn.from === 'ai' ? 'assistant' : 'user',
    content: turn.text
  }));
  messages.push({ role: 'user', content: questionText });
  
  // Resume string
  const resumeString = sessionSettings?.selectedResume?.content || '';
  
  try {
    const API_URL = 'http://localhost:5000/api/chat';
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        resumeString,
        interviewSessionId: sessionId,
        customPrompt: sessionSettings?.extraInstructions || ''
      })
    });
    
    if (!response.ok) throw new Error('Failed to get response');
    
    // Streaming response'u parse et
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    let fullStreamedText = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('0:"')) {
          const content = line.slice(3, -1)
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\\\/g, '\\');
          
          fullStreamedText += content;
          
          // UI'da göster
          let formattedText = fullStreamedText
            .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
          
          answerDiv.innerHTML = `<div class="answer-balloon"><strong>AI RESPONSE:</strong> ${formattedText}</div>`;
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Generate answer error:', error);
    answerDiv.innerHTML = '<span style="color: #ef4444;">Error: ' + error.message + '</span>';
  }
});
```

### 3. Resume API
**Endpoint:** `GET /api/resumes/{id}`  
**Açıklama:** CV içeriğini alır.

#### Request
```javascript
// main.js'de resume alma
const response = await fetch(`${API_URL}/api/resumes/${settings.selectedResume.id}`);
```

#### Response
```json
{
  "id": "resume_123",
  "file_name": "john_doe_resume.pdf",
  "content": "John Doe\nSoftware Engineer\n...",
  "file_type": "pdf",
  "file_size": 1024000
}
```

#### Kullanım
```javascript
// main.js'de resume yükleme
if (settings.selectedResume?.id && !settings.selectedResume.content) {
  console.log('🔍 Resume has no content, fetching from backend...');
  
  try {
    const API_URL = process.env.NODE_ENV === 'production' 
      ? 'https://interviewai-pro-production.up.railway.app'
      : 'http://localhost:5000';
    
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
    } else {
      console.error('❌ Failed to fetch resume:', response.status);
    }
  } catch (error) {
    console.error('❌ Error fetching resume:', error);
  }
}
```

## 🔧 Environment Configuration

### Development Environment
```bash
# .env dosyası
NODE_ENV=development
API_URL=http://localhost:5000
DEEPGRAM_API_KEY=your_development_key
```

### Production Environment
```bash
# Production environment
NODE_ENV=production
API_URL=https://interviewai-pro-production.up.railway.app
DEEPGRAM_API_KEY=your_production_key
```

### Environment Detection
```javascript
// main.js'de environment detection
const API_URL = process.env.NODE_ENV === 'production' 
  ? 'https://interviewai-pro-production.up.railway.app'
  : 'http://localhost:5000';

console.log('🌍 Environment:', process.env.NODE_ENV);
console.log('🔗 API URL:', API_URL);
```

## 🛡️ Error Handling

### API Error Types
```javascript
// API hata türleri
const API_ERRORS = {
  NETWORK_ERROR: 'Network connection failed',
  AUTH_ERROR: 'Authentication failed',
  RATE_LIMIT: 'Rate limit exceeded',
  SERVER_ERROR: 'Server internal error',
  TIMEOUT: 'Request timeout'
};
```

### Error Handling Implementation
```javascript
// overlay.html'de error handling
async function makeAPICall(url, options) {
  try {
    const response = await fetch(url, {
      ...options,
      timeout: 30000 // 30 saniye timeout
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }
    
    return response;
    
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error(API_ERRORS.NETWORK_ERROR);
    }
    
    if (error.message.includes('timeout')) {
      throw new Error(API_ERRORS.TIMEOUT);
    }
    
    throw error;
  }
}
```

### Retry Logic
```javascript
// Retry mekanizması
async function makeAPICallWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await makeAPICall(url, options);
    } catch (error) {
      console.log(`🔄 Attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

## 📊 Request/Response Logging

### Request Logging
```javascript
// API çağrılarını logla
function logAPIRequest(method, url, body) {
  console.log(`🚀 API Request: ${method} ${url}`);
  if (body) {
    console.log('📤 Request Body:', JSON.stringify(body, null, 2));
  }
}
```

### Response Logging
```javascript
// API yanıtlarını logla
function logAPIResponse(response, data) {
  console.log(`✅ API Response: ${response.status} ${response.statusText}`);
  if (data) {
    console.log('📥 Response Data:', JSON.stringify(data, null, 2));
  }
}
```

### Complete API Call Example
```javascript
// Tam API çağrı örneği
async function callChatAPI(messages, resumeString, sessionId, customPrompt) {
  const API_URL = 'http://localhost:5000/api/chat';
  
  const requestBody = {
    messages,
    resumeString,
    interviewSessionId: sessionId,
    customPrompt
  };
  
  // Request'i logla
  logAPIRequest('POST', API_URL, requestBody);
  
  try {
    const response = await makeAPICallWithRetry(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    
    // Response'u logla
    logAPIResponse(response);
    
    return response;
    
  } catch (error) {
    console.error('❌ API Call Failed:', error);
    throw error;
  }
}
```

## 🔐 Authentication

### Token Management
```javascript
// Token yönetimi
class TokenManager {
  constructor() {
    this.token = null;
    this.expiresAt = null;
  }
  
  async getValidToken() {
    if (this.token && this.expiresAt && Date.now() < this.expiresAt) {
      return this.token;
    }
    
    await this.refreshToken();
    return this.token;
  }
  
  async refreshToken() {
    try {
      const response = await fetch(`${API_URL}/api/deepgram-token`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Failed to refresh token');
      }
      
      const data = await response.json();
      this.token = data.key;
      this.expiresAt = Date.now() + (data.expires_in * 1000);
      
      console.log('✅ Token refreshed successfully');
      
    } catch (error) {
      console.error('❌ Token refresh failed:', error);
      throw error;
    }
  }
}

// Global token manager
const tokenManager = new TokenManager();
```

## 📈 Performance Monitoring

### API Call Metrics
```javascript
// API çağrı metrikleri
class APIMetrics {
  constructor() {
    this.calls = [];
    this.errors = [];
  }
  
  recordCall(method, url, duration, success) {
    this.calls.push({
      method,
      url,
      duration,
      success,
      timestamp: Date.now()
    });
    
    if (!success) {
      this.errors.push({
        method,
        url,
        timestamp: Date.now()
      });
    }
  }
  
  getStats() {
    const totalCalls = this.calls.length;
    const successfulCalls = this.calls.filter(call => call.success).length;
    const errorRate = (this.errors.length / totalCalls) * 100;
    const avgDuration = this.calls.reduce((sum, call) => sum + call.duration, 0) / totalCalls;
    
    return {
      totalCalls,
      successfulCalls,
      errorRate,
      avgDuration
    };
  }
}

// Global metrics
const apiMetrics = new APIMetrics();
```

### Performance Wrapper
```javascript
// Performance wrapper
async function timedAPICall(url, options) {
  const startTime = Date.now();
  let success = false;
  
  try {
    const response = await makeAPICall(url, options);
    success = true;
    return response;
  } finally {
    const duration = Date.now() - startTime;
    apiMetrics.recordCall(options.method, url, duration, success);
  }
}
```

## 🧪 Testing

### API Mocking
```javascript
// Test için API mock'u
class APIMock {
  constructor() {
    this.responses = new Map();
  }
  
  mockResponse(url, response) {
    this.responses.set(url, response);
  }
  
  async fetch(url, options) {
    const mockResponse = this.responses.get(url);
    
    if (mockResponse) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
        body: {
          getReader: () => ({
            read: () => Promise.resolve({ done: true })
          })
        }
      });
    }
    
    throw new Error('No mock response found');
  }
}

// Test kullanımı
const apiMock = new APIMock();
apiMock.mockResponse('/api/deepgram-token', { key: 'test_key' });
```

### Integration Tests
```javascript
// Integration test örneği
describe('API Integration', () => {
  test('should get Deepgram token', async () => {
    const response = await fetch('/api/deepgram-token', {
      method: 'POST'
    });
    
    expect(response.ok).toBe(true);
    
    const data = await response.json();
    expect(data.key).toBeDefined();
    expect(data.expires_in).toBeDefined();
  });
  
  test('should handle API errors', async () => {
    const response = await fetch('/api/nonexistent', {
      method: 'POST'
    });
    
    expect(response.ok).toBe(false);
  });
});
```

## 📝 Best Practices

### 1. Error Handling
- Her API çağrısında try-catch kullan
- Kullanıcıya anlamlı hata mesajları göster
- Network hatalarını ayrı olarak handle et

### 2. Performance
- Request timeout'ları ayarla
- Retry logic kullan
- Response caching uygula

### 3. Security
- API key'leri güvenli tut
- Input validation yap
- HTTPS kullan

### 4. Monitoring
- API çağrılarını logla
- Performance metrikleri topla
- Error rate'leri izle

---

Bu rehber, InterviewsAI Desktop uygulamasının backend API'leri ile entegrasyonu için gerekli tüm detayları içerir. API değişiklikleri durumunda bu dokümantasyonu güncelleyin.
