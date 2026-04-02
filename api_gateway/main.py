"""
FastAPI Gateway - OpenLiteAntigravity API Sunucusu
WebSocket ve REST endpoint'leri ile ajan iletişimini yönetir.
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional
import asyncio
import json
import logging
from datetime import datetime

# Logging yapılandırması
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="OpenLiteAntigravity API Gateway",
    description="AI Ajan Sistemi için merkezi API geçidi",
    version="1.0.1"
)

# CORS ayarları
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Production'da sınırlandırılmalı
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Aktif WebSocket bağlantılarını takip et
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
    
    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"Client {client_id} connected")
    
    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            logger.info(f"Client {client_id} disconnected")
    
    async def send_personal_message(self, message: dict, client_id: str):
        if client_id in self.active_connections:
            await self.active_connections[client_id].send_json(message)
    
    async def broadcast(self, message: dict):
        for connection in self.active_connections.values():
            await connection.send_json(message)

manager = ConnectionManager()

# Pydantic modelleri
class TaskRequest(BaseModel):
    task: str
    model_provider: str = "ollama"
    model_name: str = "llama3"
    client_id: str

class TaskResponse(BaseModel):
    task_id: str
    status: str
    message: str

class AgentMessage(BaseModel):
    agent_name: str
    message: str
    timestamp: datetime
    thought: Optional[str] = None
    action: Optional[str] = None

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now()}

# Görev oluşturma endpoint'i
@app.post("/api/v1/tasks", response_model=TaskResponse)
async def create_task(request: TaskRequest):
    """
    Yeni bir AI görevi oluşturur ve ajan sistemine iletir.
    """
    task_id = f"task_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    logger.info(f"Task created: {task_id} - {request.task}")
    
    # WebSocket üzerinden bağlı istemciye bilgi gönder
    await manager.send_personal_message({
        "type": "task_created",
        "task_id": task_id,
        "status": "queued",
        "message": "Görev alındı, işleniyor..."
    }, request.client_id)
    
    return TaskResponse(
        task_id=task_id,
        status="queued",
        message="Görev başarıyla oluşturuldu"
    )

# Görev durumu sorgulama
@app.get("/api/v1/tasks/{task_id}")
async def get_task_status(task_id: str):
    """
    Belirli bir görevin durumunu döndürür.
    """
    # TODO: Gerçek implementasyonda veritabanından çekilecek
    return {
        "task_id": task_id,
        "status": "processing",
        "progress": 45,
        "current_agent": "planner",
        "logs": []
    }

# WebSocket endpoint'i
@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """
    Real-time ajan mesajları ve loglar için WebSocket bağlantısı.
    """
    await manager.connect(websocket, client_id)
    
    try:
        # Bağlantı onay mesajı
        await manager.send_personal_message({
            "type": "connected",
            "client_id": client_id,
            "message": "Bağlantı başarılı. Ajan mesajları burada görünecek."
        }, client_id)
        
        while True:
            # İstemciden gelen mesajları dinle
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                logger.info(f"Received from {client_id}: {message}")
                
                # Mesaj tipine göre işle
                if message.get("type") == "ping":
                    await manager.send_personal_message({
                        "type": "pong",
                        "timestamp": datetime.now().isoformat()
                    }, client_id)
                
                elif message.get("type") == "cancel_task":
                    task_id = message.get("task_id")
                    logger.info(f"Task cancellation requested: {task_id}")
                    # TODO: Görev iptal mantığı
                    
            except json.JSONDecodeError:
                await manager.send_personal_message({
                    "type": "error",
                    "message": "Geçersiz JSON formatı"
                }, client_id)
                
    except WebSocketDisconnect:
        manager.disconnect(client_id)
        logger.info(f"Client {client_id} disconnected")

# Ajan mesajı gönderme (internal kullanım)
@app.post("/api/v1/agents/message")
async def send_agent_message(message: AgentMessage):
    """
    Ajanlardan gelen mesajları WebSocket istemcilerine iletir.
    """
    await manager.broadcast({
        "type": "agent_message",
        "agent_name": message.agent_name,
        "message": message.message,
        "thought": message.thought,
        "action": message.action,
        "timestamp": message.timestamp.isoformat()
    })
    
    return {"status": "sent"}

# Model sağlayıcılarını listeleme
@app.get("/api/v1/models")
async def list_models():
    """
    Mevcut LLM sağlayıcılarını ve modellerini listeler.
    """
    return {
        "providers": [
            {
                "name": "ollama",
                "type": "local",
                "models": ["llama3", "mistral", "codellama"]
            },
            {
                "name": "openai",
                "type": "cloud",
                "models": ["gpt-4", "gpt-3.5-turbo"]
            },
            {
                "name": "anthropic",
                "type": "cloud",
                "models": ["claude-3-opus", "claude-3-sonnet"]
            }
        ]
    }

# Ana sayfa
@app.get("/")
async def root():
    return {
        "message": "OpenLiteAntigravity API Gateway",
        "version": "1.0.1",
        "docs": "/docs",
        "health": "/health"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
