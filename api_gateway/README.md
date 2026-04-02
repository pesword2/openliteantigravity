# API Gateway - OpenLiteAntigravity

FastAPI tabanlı merkezi API geçidi. WebSocket ve REST endpoint'leri ile ajan iletişimini yönetir.

## Özellikler

- ✅ **WebSocket Desteği**: Real-time ajan mesajları ve log akışı
- ✅ **REST API**: Görev oluşturma, durum sorgulama
- ✅ **CORS Desteği**: Tarayıcı tabanlı arayüzlerle uyumlu
- ✅ **Model Yönetimi**: Çoklu LLM sağlayıcı desteği
- ✅ **Health Check**: Sistem sağlık durumu izleme

## Endpoint'ler

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/` | Ana sayfa |
| GET | `/health` | Sağlık kontrolü |
| POST | `/api/v1/tasks` | Yeni görev oluştur |
| GET | `/api/v1/tasks/{id}` | Görev durumu sorgula |
| GET | `/api/v1/models` | Model listesini al |
| POST | `/api/v1/agents/message` | Ajan mesajı gönder |
| WS | `/ws/{client_id}` | WebSocket bağlantısı |

## Kurulum

```bash
# Bağımlılıkları yükle
pip install -r requirements.txt

# Sunucuyu başlat
python start.sh
```

## Kullanım Örnekleri

### Görev Oluşturma
```bash
curl -X POST http://localhost:8000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "task": "GitHub reposunu analiz et",
    "model_provider": "ollama",
    "model_name": "llama3",
    "client_id": "user123"
  }'
```

### WebSocket Bağlantısı (JavaScript)
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/user123');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Ajan mesajı:', data);
};
```

## API Dokümantasyonu

Sunucu çalışırken `http://localhost:8000/docs` adresinden Swagger UI ile interaktif API dokümantasyonuna erişebilirsiniz.

## Yapılandırma

Varsayılan ayarlar:
- **Host**: `0.0.0.0`
- **Port**: `8000`
- **Log Level**: `info`

## Güvenlik Notları

⚠️ **Production Ortamı İçin:**
- CORS ayarlarını sınırlandırın
- WebSocket kimlik doğrulaması ekleyin
- Rate limiting uygulayın
- HTTPS kullanın
