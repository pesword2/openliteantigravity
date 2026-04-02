# Docker Sandbox - Güvenli Kod Yürütme Modülü

## 📋 Genel Bakış

Bu modül, AI ajanları tarafından üretilen kodun **güvenli**, **izole** ve **kontrol edilebilir** bir ortamda çalıştırılmasını sağlar. Docker konteynerleri kullanarak host sistemden tam izolasyon sunar.

## 🔒 Güvenlik Özellikleri

- ✅ **Root Yetkisi Yok**: Kodlar root olmayan kullanıcı (`nobody` veya `sandbox`) olarak çalışır
- ✅ **Ağ Erişimi Kapalı**: Varsayılan olarak internete erişim engellenmiştir
- ✅ **Kaynak Limitleri**: CPU (%50) ve RAM (512MB) sınırları
- ✅ **Timeout Koruması**: Uzun süren işlemler otomatik sonlandırılır
- ✅ **Geçici Workspace**: Her yürütme için yeni, izole çalışma alanı
- ✅ **Otomatik Temizlik**: İşlem sonrası tüm dosyalar silinir

## 🚀 Hızlı Başlangıç

### 1. Bağımlılıkları Yükleyin

```bash
pip install docker
```

### 2. Temel Kullanım

```python
from src.sandbox import DockerSandbox, SandboxConfig

# Sandbox oluştur
sandbox = DockerSandbox()

# Sağlık kontrolü
if not sandbox.health_check():
    print("Docker çalışmıyor!")
    exit(1)

# Kod çalıştır
code = """
print("Merhaba Dünya!")
for i in range(5):
    print(f"Sayı: {i}")
"""

result = sandbox.execute(code)

# Sonuçları işle
if result.success:
    print("✅ Başarılı!")
    print(result.stdout)
else:
    print("❌ Hata:")
    print(result.stderr)
```

### 3. Özel Yapılandırma

```python
from src.sandbox import DockerSandbox, SandboxConfig

# Özel konfigürasyon
config = SandboxConfig(
    image="python:3.11-slim",  # Docker imajı
    timeout=60,                 # 60 saniye timeout
    memory_limit="1g",          # 1GB RAM limiti
    cpu_limit=1.0,              # 1 CPU çekirdek
    network_enabled=False,      # Ağ kapalı
    user="nobody"               # Root olmayan kullanıcı
)

sandbox = DockerSandbox(config)
result = sandbox.execute(code)
```

## 📊 API Referansı

### `DockerSandbox` Sınıfı

#### `__init__(config: Optional[SandboxConfig] = None)`
Sandbox instance'ı oluşturur.

#### `execute(code: str, language: str = "python") -> ExecutionResult`
Kodu çalıştırır ve sonucu döndürür.

**Parametreler:**
- `code`: Çalıştırılacak kod (string)
- `language`: Programlama dili (şimdilik sadece "python")

**Döndürür:**
- `ExecutionResult`: Yürütme sonucu

#### `execute_with_timeout(code: str, language: str = "python") -> ExecutionResult`
Timeout korumalı kod yürütme.

#### `health_check() -> bool`
Docker daemon'ın çalışıp çalışmadığını kontrol eder.

#### `get_system_info() -> Dict[str, Any]`
Sistem bilgilerini döndürür.

### `SandboxConfig` Dataclass

| Parametre | Tip | Varsayılan | Açıklama |
|-----------|-----|------------|----------|
| `image` | str | "python:3.11-slim" | Docker imajı |
| `timeout` | int | 30 | Timeout (saniye) |
| `memory_limit` | str | "512m" | RAM limiti |
| `cpu_limit` | float | 0.5 | CPU limiti (çekirdek) |
| `network_enabled` | bool | False | Ağ erişimi |
| `working_dir` | str | "/workspace" | Çalışma dizini |
| `user` | str | "nobody" | Kullanıcı |

### `ExecutionResult` Dataclass

| Alan | Tip | Açıklama |
|------|-----|----------|
| `success` | bool | İşlem başarılı mı? |
| `stdout` | str | Standart çıktı |
| `stderr` | str | Hata çıktısı |
| `exit_code` | int | Çıkış kodu |
| `execution_time` | float | Yürütme süresi (saniye) |
| `error_message` | Optional[str] | Hata mesajı |

## 🧪 Test Etme

Modülü test etmek için:

```bash
cd /workspace
python src/sandbox/docker_sandbox.py
```

Bu komut şu testleri çalıştırır:
1. ✅ Docker sağlık kontrolü
2. ✅ Basit Python kodu çalıştırma
3. ✅ Hatalı kod handling
4. ✅ Dosya sistemi erişimi

## 🛡️ Güvenlik En İyi Uygulamaları

### 1. Her Zaman Network'ü Kapalı Tutun
```python
config = SandboxConfig(network_enabled=False)
```

### 2. Düşük Kaynak Limitleri Kullanın
```python
config = SandboxConfig(
    memory_limit="256m",
    cpu_limit=0.25
)
```

### 3. Kısa Timeout Belirleyin
```python
config = SandboxConfig(timeout=10)
```

### 4. Root Olmayan Kullanıcı Kullanın
```python
config = SandboxConfig(user="nobody")
```

## ⚠️ Bilinen Limitasyonlar

1. **Sadece Python**: Şu anda sadece Python kodu desteklenmektedir
2. **Docker Gereksinimi**: Host makinede Docker kurulu olmalıdır
3. **Linux/Mac**: Windows'ta ek yapılandırma gerekebilir

## 🔮 Gelecek Özellikler

- [ ] Node.js, Go, Rust gibi diller için destek
- [ ] Çoklu dil desteği (Jupyter notebook tarzı)
- [ ] Persistent storage opsiyonu
- [ ] GPU erişimi (isteğe bağlı)
- [ ] Distributed sandboxing

## 📝 Örnek Senaryolar

### Senaryo 1: AI Tarafından Üretilen Kodu Test Etme

```python
# AI'dan gelen kod
ai_generated_code = """
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

print([fibonacci(i) for i in range(10)])
"""

result = sandbox.execute(ai_generated_code)
if result.success:
    print("AI kodu başarıyla çalıştı!")
    print(result.stdout)
```

### Senaryo 2: Güvenlik Testi (Kötü Niyetli Kod)

```python
# Bu kod çalışmaz - ağ erişimi yok
malicious_code = """
import socket
s = socket.socket()
s.connect(('evil.com', 80))
"""

result = sandbox.execute(malicious_code)
print(f"Bloklandı: {not result.success}")
```

### Senaryo 3: Sonsuz Döngü Koruması

```python
# Bu kod timeout ile sonlandırılır
infinite_loop = """
while True:
    pass
"""

result = sandbox.execute_with_timeout(infinite_loop)
print(f"Timeout: {result.error_message}")
```

## 🤝 Katkıda Bulunma

Güvenlik açıkları bulursanız lütfen hemen bildirin!

## 📄 Lisans

MIT License - OpenLiteAntigravity Projesi
