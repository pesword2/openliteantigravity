"""
OpenLiteAntigravity - Ana Uygulama Giriş Noktası
Tüm modülleri (API Gateway, Orchestrator, Sandbox, Git, Web Navigator) birleştirir.
"""

import asyncio
import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# Modül Import Kontrolleri - Başlangıçta bağımlılıkları doğrula
try:
    from src.sandbox.docker_sandbox import DockerSandbox
    from src.git_manager.git_operations import GitOperations
    from src.web_navigator.navigator import WebNavigator
    from src.orchestrator.task_manager import TaskManager
    from src.orchestrator.agents import create_planner_agent, create_coder_agent, create_reviewer_agent
except ImportError as e:
    print(f"KRİTİK HATA: Modül import edilemedi: {e}")
    print("Lütfen 'pip install -r requirements.txt' komutunu çalıştırın.")
    sys.exit(1)

# Loglama Yapılandırması
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("logs/app.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("OpenLiteAntigravity")

# Global Nesneler (Singleton Pattern)
sandbox = None
git_ops = None
web_nav = None
task_manager = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Uygulama başlangıç ve kapanış yaşam döngüsü."""
    global sandbox, git_ops, web_nav, task_manager
    
    logger.info("🚀 OpenLiteAntigravity başlatılıyor...")
    
    # Servisleri Başlat
    try:
        sandbox = DockerSandbox()
        logger.info("✅ Docker Sandbox hazır.")
    except Exception as e:
        logger.warning(f"⚠️ Docker Sandbox başlatılamadı: {e}. Kod yürütme devre dışı kalacak.")
        sandbox = None

    try:
        git_ops = GitOperations(workspace_root="./workspace")
        logger.info("✅ Git Manager hazır.")
    except Exception as e:
        logger.error(f"❌ Git Manager başlatılamadı: {e}")
        git_ops = None

    try:
        web_nav = WebNavigator()
        logger.info("✅ Web Navigator hazır.")
    except Exception as e:
        logger.warning(f"⚠️ Web Navigator başlatılamadı: {e}. Web erişimi devre dışı kalacak.")
        web_nav = None

    try:
        task_manager = TaskManager()
        logger.info("✅ Ajan Orkestratörü hazır.")
    except Exception as e:
        logger.error(f"❌ Ajan Orkestratörü başlatılamadı: {e}")
        task_manager = None

    yield  # Uygulama çalışıyor

    # Kapanış Temizliği
    logger.info("🛑 OpenLiteAntigravity kapatılıyor...")
    if web_nav:
        await web_nav.close()
    if sandbox:
        sandbox.cleanup()

# FastAPI Uygulaması
app = FastAPI(
    title="OpenLiteAntigravity API",
    description="Açık kaynaklı, model-bağımsız AI kod geliştirme platformu.",
    version="1.0.1",
    lifespan=lifespan
)

# CORS Ayarları (Geliştirme Ortamı İçin Geniş İzinler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Production'da kısıtlanmalı
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "message": "OpenLiteAntigravity API Aktif",
        "version": "1.0.1",
        "status": "running",
        "modules": {
            "sandbox": "active" if sandbox else "inactive",
            "git": "active" if git_ops else "inactive",
            "web": "active" if web_nav else "inactive",
            "orchestrator": "active" if task_manager else "inactive"
        }
    }

@app.get("/health")
async def health_check():
    """Servis sağlık durumu."""
    return {"status": "healthy"}

@app.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket):
    """Canlı log akışı için WebSocket endpoint'i."""
    await websocket.accept()
    logger.info("WebSocket bağlantısı kabul edildi.")
    try:
        while True:
            # İstemciden gelen mesajları dinle (örn: abonelik iptali)
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        logger.info("WebSocket bağlantısı kesildi.")

@app.post("/tasks/run")
async def run_task(task_data: dict):
    """
    Yeni bir görev çalıştırır.
    Beklenen JSON: { "prompt": "Kullanıcı isteği", "model": "ollama/llama3" }
    """
    if not task_manager:
        return {"error": "Orchestrator servisi aktif değil."}
    
    prompt = task_data.get("prompt")
    if not prompt:
        return {"error": "Görev metni (prompt) eksik."}

    logger.info(f"Yeni görev alındı: {prompt[:50]}...")
    
    # Asenkron olarak görevi başlat (Bloklamadan yanıt dön)
    # Gerçek senaryoda buraya bir Queue (Celery/RQ) eklenebilir.
    asyncio.create_task(task_manager.process_task(prompt))
    
    return {
        "status": "accepted",
        "message": "Görev işleme alındı. Logları WebSocket'ten takip edin."
    }

if __name__ == "__main__":
    import uvicorn
    # Sunucuyu başlat
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Geliştirme modu için otomatik yeniden yükleme
        log_level="info"
    )
