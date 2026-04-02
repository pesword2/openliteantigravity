"""
AutoGen Ajan Tanımları

Planner, Coder ve Reviewer rollerinin tanımları ve yapılandırmaları.
"""

from enum import Enum
from typing import Optional, Dict, Any, List
from autogen_agentchat.agents import AssistantAgent
from autogen_core.models._model_client import ChatCompletionClient
import logging

logger = logging.getLogger(__name__)


class AgentRole(Enum):
    """Ajan rol tanımları"""
    PLANNER = "planner"
    CODER = "coder"
    REVIEWER = "reviewer"
    TESTER = "tester"


# ==================== SİSTEM PROMPTLARI ====================

PLANNER_SYSTEM_PROMPT = """
Sen OpenLiteAntigravity projesinin Planlayıcı Ajanısın (Planner Agent).

GÖREVİN:
1. Kullanıcının verdiği görevi analiz et
2. Adım adım bir yol haritası oluştur
3. Hangi araçların kullanılacağını belirle (Git, Web Navigator, Sandbox)
4. Görevi alt görevlere böl
5. Her alt görev için başarı kriterleri tanımla

KURALLAR:
- Açık ve net adımlar oluştur
- Her adımda hangi aracın kullanılacağını belirt
- Riskleri ve potansiyel sorunları öngör
- Alternatif yaklaşımlar sun

ÇIKTI FORMATI:
{
  "task": "Ana görev açıklaması",
  "steps": [
    {
      "id": 1,
      "description": "Adım açıklaması",
      "tool": "git_manager|web_navigator|sandbox|llm",
      "success_criteria": "Başarı kriteri"
    }
  ],
  "risks": ["Potansiyel risk 1", "Potansiyel risk 2"]
}

ÖRNEK GÖREV: "GitHub'daki X reposunu analiz et ve bug fix PR'ı hazırla"
CEVAP:
1. Git Manager ile repo'yu clone et
2. Kod tabanını incele, ilgili dosyaları bul
3. Bug'ı tespit et ve fix planı oluştur
4. Coder ajanına fix'i yazdır
5. Sandbox'ta test et
6. Reviewer ajanına kontrol ettir
7. Başarılıysa commit ve push hazırlığı yap
"""

CODER_SYSTEM_PROMPT = """
Sen OpenLiteAntigravity projesinin Kodlayıcı Ajanısın (Coder Agent).

GÖREVİN:
1. Planner ajanının oluşturduğu plana göre kod yaz
2. Temiz, okunabilir ve iyi dokümante edilmiş kod üret
3. Best practice'lere uy
4. Hata yönetimini unutma
5. Test edilebilir kod yaz

KURALLAR:
- Tek seferde tek bir dosya üzerinde çalış
- Her değişiklikten sonra Sandbox'ta test et
- Mevcut kod stilini koru
- Yorum satırları ekle ama abartma
- Tip hint'leri kullan (Python için type hints)

ARAÇLAR:
- Sandbox: Kodu güvenli ortamda çalıştır
- Git Manager: Değişiklikleri takip et
- Web Navigator: Dokümantasyon oku (gerekirse)

ÇIKTI FORMATI:
```python
# Dosya: path/to/file.py
# Açıklama: Ne yapıyor?
def function_name(param: str) -> int:
    \"\"\"Docstring\"\"\"
    # Implementation
    return result
```

TEST SONRASI:
Kod yazdıktan sonra mutlaka Sandbox'ta çalıştır:
- Syntax hataları var mı?
- Runtime hataları var mı?
- Beklenen çıktı alınıyor mu?
"""

REVIEWER_SYSTEM_PROMPT = """
Sen OpenLiteAntigravity projesinin Gözden Geçirici Ajanısın (Reviewer Agent).

GÖREVİN:
1. Coder ajanının yazdığı kodu inceleyip onayla veya reddet
2. Güvenlik açıklarını tespit et
3. Performans sorunlarını belirle
4. Kod kalitesini değerlendir
5. İyileştirme önerileri sun

KONTROL LİSTESİ:
□ Kod düzgün çalışıyor mu? (Sandbox testi)
□ Güvenlik açıkları var mı? (SQL injection, XSS, vb.)
□ Performans sorunları var mı? (N+1 query, bellek sızıntısı)
□ Kod okunabilir mi? (İsimlendirme, yapı)
□ Testler yazılmış mı?
□ Dokümantasyon yeterli mi?
□ Mevcut kod stiline uygun mu?

DEĞERLENDİRME KRİTERLERİ:
- CRITICAL: Güvenlik açığı veya ciddi hata → REDDET
- MAJOR: Önemli sorun → DÜZELTME TALEP ET
- MINOR: Küçük sorunlar → ÖNERİ YAP
- OK: Sorun yok → ONAYLA

ÇIKTI FORMATI:
{
  "decision": "APPROVE|REJECT|REQUEST_CHANGES",
  "severity": "CRITICAL|MAJOR|MINOR|NONE",
  "issues": [
    {
      "line": 42,
      "type": "security|performance|style",
      "description": "Sorun açıklaması",
      "suggestion": "Önerilen düzeltme"
    }
  ],
  "summary": "Genel değerlendirme"
}
"""


# ==================== AJAN OLUŞTURUCULAR ====================

def create_planner_agent(
    model_client: ChatCompletionClient,
    name: str = "Planner",
    description: str = "Görev planlama ve strateji belirleme ajanı"
) -> AssistantAgent:
    """
    Planner ajanı oluştur
    
    Args:
        model_client: AutoGen chat completion client
        name: Ajan adı
        description: Ajan açıklaması
        
    Returns:
        AssistantAgent: Yapılandırılmış planner ajanı
    """
    agent = AssistantAgent(
        name=name,
        description=description,
        system_message=PLANNER_SYSTEM_PROMPT,
        model_client=model_client,
        tools=[]  # Planner doğrudan araç kullanmaz, diğer ajanlara yönlendirir
    )
    
    logger.info(f"Planner ajanı oluşturuldu: {name}")
    return agent


def create_coder_agent(
    model_client: ChatCompletionClient,
    name: str = "Coder",
    description: str = "Kod yazma ve implementasyon ajanı",
    sandbox_enabled: bool = True
) -> AssistantAgent:
    """
    Coder ajanı oluştur
    
    Args:
        model_client: AutoGen chat completion client
        name: Ajan adı
        description: Ajan açıklaması
        sandbox_enabled: Sandbox kod testi aktif mi?
        
    Returns:
        AssistantAgent: Yapılandırılmış coder ajanı
    """
    # Araç tanımı - Sandbox entegrasyonu
    tools = []
    
    if sandbox_enabled:
        # Sandbox aracı eklenecek (task_manager'da tanımlanacak)
        pass
    
    agent = AssistantAgent(
        name=name,
        description=description,
        system_message=CODER_SYSTEM_PROMPT,
        model_client=model_client,
        tools=tools
    )
    
    logger.info(f"Coder ajanı oluşturuldu: {name} (sandbox={sandbox_enabled})")
    return agent


def create_reviewer_agent(
    model_client: ChatCompletionClient,
    name: str = "Reviewer",
    description: str = "Kod gözden geçirme ve kalite kontrol ajanı"
) -> AssistantAgent:
    """
    Reviewer ajanı oluştur
    
    Args:
        model_client: AutoGen chat completion client
        name: Ajan adı
        description: Ajan açıklaması
        
    Returns:
        AssistantAgent: Yapılandırılmış reviewer ajanı
    """
    agent = AssistantAgent(
        name=name,
        description=description,
        system_message=REVIEWER_SYSTEM_PROMPT,
        model_client=model_client,
        tools=[]  # Reviewer sadece analiz yapar
    )
    
    logger.info(f"Reviewer ajanı oluşturuldu: {name}")
    return agent


def get_default_agent_config(
    provider: str = "ollama",
    model_name: str = "llama3"
) -> Dict[str, Any]:
    """
    Varsayılan ajan yapılandırmasını döndür
    
    Args:
        provider: Model sağlayıcı (ollama, openai, anthropic)
        model_name: Model adı
        
    Returns:
        Dict: Yapılandırma parametreleri
    """
    configs = {
        "ollama": {
            "model": f"ollama/{model_name}",
            "base_url": "http://localhost:11434/v1",
            "api_key": "ollama",
            "temperature": 0.7,
            "max_tokens": 4096
        },
        "openai": {
            "model": model_name or "gpt-4o",
            "temperature": 0.7,
            "max_tokens": 4096
        },
        "anthropic": {
            "model": model_name or "claude-sonnet-4-20250514",
            "temperature": 0.7,
            "max_tokens": 4096
        }
    }
    
    return configs.get(provider, configs["ollama"])
