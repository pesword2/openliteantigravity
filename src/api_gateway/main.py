"""
FastAPI Gateway - OpenLiteAntigravity API Sunucusu

WebSocket ve REST API yönetimi, gerçek zamanlı ajan iletişimi.
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import asyncio
import json
import logging
from datetime import datetime
import uuid

# Logging ayarları
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="OpenLiteAntigravity API",
    description="AI Kod Geliştirme Platformu API Gateway",
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

# ==================== MODELLER ====================

class TaskRequest(BaseModel):
    """Görev isteği modeli"""
    task_id: Optional[str] = None
    description: str
    model_provider: str = "ollama"
    model_name: str = "llama3"
    priority: int = 1
    metadata: Optional[Dict[str, Any]] = None

class TaskResponse(BaseModel):
    """Görev yanıtı modeli"""
    task_id: str
    status: str
    message: str
    created_at: datetime

class AgentMessage(BaseModel):
    """Ajan mesajı modeli"""
    agent_id: str
    message_type: str  # thought, action, result, error
    content: str
    timestamp: datetime

class LogEntry(BaseModel):
    """Log girişi modeli"""
    task_id: str
    agent_id: Optional[str]
    level: str  # info, warning, error, debug
    message: str
    timestamp: datetime
    metadata: Optional[Dict[str, Any]] = None

# ==================== DURUM YÖNETİMİ ====================

class ConnectionManager:
    """WebSocket bağlantı yöneticisi"""
    
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.task_status: Dict[str, Dict] = {}
        self.logs: Dict[str, List[LogEntry]] = {}
    
    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info(f"Client connected: {client_id}")
    
    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            logger.info(f"Client disconnected: {client_id}")
    
    async def send_personal_message(self, message: dict, client_id: str):
        if client_id in self.active_connections:
            await self.active_connections[client_id].send_json(message)
    
    async def broadcast(self, message: dict):
        """Tüm bağlı istemcilere mesaj gönder"""
        for connection in self.active_connections.values():
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Broadcast error: {e}")
    
    def update_task_status(self, task_id: str, status: dict):
        self.task_status[task_id] = {
            **status,
            "updated_at": datetime.now().isoformat()
        }
    
    def add_log(self, task_id: str, log_entry: LogEntry):
        if task_id not in self.logs:
            self.logs[task_id] = []
        self.logs[task_id].append(log_entry)

manager = ConnectionManager()

# ==================== ROUTES ====================

@app.get("/")
async def root():
    """API sağlık kontrolü"""
    return {
        "status": "healthy",
        "service": "OpenLiteAntigravity API Gateway",
        "version": "1.0.1",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/health")
async def health_check():
    """Detaylı sağlık kontrolü"""
    return {
        "status": "ok",
        "active_connections": len(manager.active_connections),
        "active_tasks": len(manager.task_status),
        "timestamp": datetime.now().isoformat()
    }

@app.post("/tasks", response_model=TaskResponse)
async def create_task(task: TaskRequest, background_tasks: BackgroundTasks):
    """Yeni görev oluştur"""
    task_id = task.task_id or str(uuid.uuid4())
    
    # Görev durumunu başlat
    manager.update_task_status(task_id, {
        "description": task.description,
        "status": "pending",
        "model_provider": task.model_provider,
        "model_name": task.model_name,
        "priority": task.priority,
        "created_at": datetime.now().isoformat()
    })
    
    # Arka planda görevi işle (AutoGen orchestrator'a yönlendirilecek)
    background_tasks.add_task(process_task, task_id, task)
    
    return TaskResponse(
        task_id=task_id,
        status="pending",
        message="Task created successfully",
        created_at=datetime.now()
    )

@app.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    """Görev durumunu getir"""
    if task_id not in manager.task_status:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return manager.task_status[task_id]

@app.get("/tasks/{task_id}/logs")
async def get_task_logs(task_id: str):
    """Görev loglarını getir"""
    if task_id not in manager.logs:
        return []
    
    return manager.logs[task_id]

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """WebSocket bağlantısı - Gerçek zamanlı ajan iletişimi"""
    await manager.connect(websocket, client_id)
    
    try:
        while True:
            data = await websocket.receive_json()
            
            # İstemciden gelen mesajları işle
            message_type = data.get("type")
            
            if message_type == "task_update":
                # Görev güncellemesi
                task_id = data.get("task_id")
                status = data.get("status")
                if task_id and status:
                    manager.update_task_status(task_id, {"status": status})
                    await manager.broadcast({
                        "type": "task_status_update",
                        "task_id": task_id,
                        "status": status
                    })
            
            elif message_type == "agent_message":
                # Ajan mesajı
                agent_msg = AgentMessage(**data)
                await manager.broadcast({
                    "type": "agent_message",
                    "data": agent_msg.dict()
                })
            
            elif message_type == "log_entry":
                # Log girişi
                log = LogEntry(**data)
                manager.add_log(log.task_id, log)
                await manager.broadcast({
                    "type": "log_update",
                    "data": log.dict()
                })
    
    except WebSocketDisconnect:
        manager.disconnect(client_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(client_id)

# ==================== GÖREV İŞLEME ====================

async def process_task(task_id: str, task: TaskRequest):
    """
    Görev işleme fonksiyonu
    Gerçek implementasyonda AutoGen orchestrator'a yönlendirilecek
    """
    try:
        # Durumu güncelle
        manager.update_task_status(task_id, {"status": "processing"})
        await manager.broadcast({
            "type": "task_status_update",
            "task_id": task_id,
            "status": "processing"
        })
        
        # Log ekle
        log = LogEntry(
            task_id=task_id,
            agent_id="orchestrator",
            level="info",
            message=f"Task started: {task.description}",
            timestamp=datetime.now()
        )
        manager.add_log(task_id, log)
        
        # Simüle edilmiş görev işleme
        await asyncio.sleep(2)
        
        # Başarılı tamamlama
        manager.update_task_status(task_id, {"status": "completed"})
        await manager.broadcast({
            "type": "task_status_update",
            "task_id": task_id,
            "status": "completed"
        })
        
        logger.info(f"Task {task_id} completed successfully")
    
    except Exception as e:
        logger.error(f"Task {task_id} failed: {e}")
        manager.update_task_status(task_id, {"status": "failed", "error": str(e)})
        await manager.broadcast({
            "type": "task_status_update",
            "task_id": task_id,
            "status": "failed"
        })

# ==================== BAŞLATMA ====================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
