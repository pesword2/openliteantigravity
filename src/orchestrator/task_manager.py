"""
Task Manager - Görev Yönetimi ve AutoGen Orkestrasyonu

Bu modül, AutoGen ajanlarını koordine eder, görevleri yönetir
ve sonuçları işler.
"""

import asyncio
from typing import Optional, Dict, Any, List, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import logging
import json

from autogen_agentchat.teams import RoundRobinGroupChat, SelectorGroupChat
from autogen_core.models._model_client import ChatCompletionClient
from autogen_agentchat.messages import ChatMessage

from .agents import (
    create_planner_agent,
    create_coder_agent,
    create_reviewer_agent,
    get_default_agent_config
)

logger = logging.getLogger(__name__)


class TaskStatus(Enum):
    """Görev durumları"""
    PENDING = "pending"
    PLANNING = "planning"
    CODING = "coding"
    TESTING = "testing"
    REVIEWING = "reviewing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class TaskResult:
    """Görev sonucu"""
    task_id: str
    status: TaskStatus
    output: str
    artifacts: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    execution_time: float = 0.0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class TaskManager:
    """
    AutoGen tabanlı görev yöneticisi.
    
    Bu sınıf:
    1. Ajanları başlatır ve yapılandırır
    2. Görevleri planlar ve dağıtır
    3. Ajanlar arası iletişimi yönetir
    4. Sonuçları toplar ve raporlar
    """
    
    def __init__(
        self,
        model_client: Optional[ChatCompletionClient] = None,
        model_provider: str = "ollama",
        model_name: str = "llama3",
        workspace_root: str = "./workspace",
        sandbox_enabled: bool = True,
        max_turns: int = 20
    ):
        """
        TaskManager'ı başlat
        
        Args:
            model_client: AutoGen model client (opsiyonel, sağlanmazsa otomatik oluşturulur)
            model_provider: Model sağlayıcı (ollama, openai, anthropic)
            model_name: Model adı
            workspace_root: Çalışma alanı kök dizini
            sandbox_enabled: Sandbox kod testi aktif mi?
            max_turns: Maksimum ajan dönüş sayısı
        """
        self.model_provider = model_provider
        self.model_name = model_name
        self.workspace_root = workspace_root
        self.sandbox_enabled = sandbox_enabled
        self.max_turns = max_turns
        
        # Model client
        self.model_client = model_client or self._create_model_client()
        
        # Ajanlar
        self.planner = None
        self.coder = None
        self.reviewer = None
        
        # Ajan takımı
        self.team = None
        
        # Aktif görevler
        self.active_tasks: Dict[str, TaskResult] = {}
        
        # Callback'ler
        self.on_status_change: Optional[Callable[[str, TaskStatus], None]] = None
        self.on_message: Optional[Callable[[str, ChatMessage], None]] = None
        
        logger.info(
            f"TaskManager başlatıldı: provider={model_provider}, "
            f"model={model_name}, sandbox={sandbox_enabled}"
        )
    
    def _create_model_client(self) -> ChatCompletionClient:
        """Model client oluştur (provider'a göre)"""
        from autogen_ext.models.openai import OpenAIChatCompletionClient
        
        config = get_default_agent_config(self.model_provider, self.model_name)
        
        if self.model_provider == "ollama":
            # Ollama için OpenAI uyumlu client
            return OpenAIChatCompletionClient(
                model=config["model"],
                base_url=config["base_url"],
                api_key=config["api_key"],
                temperature=config["temperature"],
                max_tokens=config["max_tokens"]
            )
        elif self.model_provider == "openai":
            return OpenAIChatCompletionClient(
                model=config["model"],
                temperature=config["temperature"],
                max_tokens=config["max_tokens"]
            )
        elif self.model_provider == "anthropic":
            from autogen_ext.models.anthropic import AnthropicChatCompletionClient
            return AnthropicChatCompletionClient(
                model=config["model"],
                temperature=config["temperature"],
                max_tokens=config["max_tokens"]
            )
        else:
            raise ValueError(f"Bilinmeyen model sağlayıcı: {self.model_provider}")
    
    def initialize_agents(self):
        """Ajanları oluştur ve başlat"""
        logger.info("Ajanlar başlatılıyor...")
        
        # Planner ajanı
        self.planner = create_planner_agent(
            model_client=self.model_client,
            name="Planner"
        )
        
        # Coder ajanı
        self.coder = create_coder_agent(
            model_client=self.model_client,
            name="Coder",
            sandbox_enabled=self.sandbox_enabled
        )
        
        # Reviewer ajanı
        self.reviewer = create_reviewer_agent(
            model_client=self.model_client,
            name="Reviewer"
        )
        
        # Ajan takımını oluştur (SelectorGroupChat - akıllı seçim)
        self.team = SelectorGroupChat(
            participants=[self.planner, self.coder, self.reviewer],
            model_client=self.model_client,
            selector_prompt="Sen bir koordinatörsün. Görevin hangi ajanın sıradaki olduğunu belirlemek.",
            max_turns=self.max_turns
        )
        
        logger.info("Tüm ajanlar başarıyla başlatıldı")
    
    async def execute_task(
        self,
        task_id: str,
        description: str,
        context: Optional[Dict[str, Any]] = None
    ) -> TaskResult:
        """
        Görevi yürüt
        
        Args:
            task_id: Görev kimliği
            description: Görev açıklaması
            context: Ek bağlam (repo URL, dosya yolları, vb.)
            
        Returns:
            TaskResult: Görev sonucu
        """
        logger.info(f"Görev başlatılıyor: {task_id} - {description[:50]}...")
        
        # Görev durumu oluştur
        task_result = TaskResult(
            task_id=task_id,
            status=TaskStatus.PENDING,
            output="",
            started_at=datetime.now()
        )
        self.active_tasks[task_id] = task_result
        
        try:
            # Ajanları başlat (henüz başlatılmadıysa)
            if not self.team:
                self.initialize_agents()
            
            # Durum güncelle: Planning
            self._update_status(task_id, TaskStatus.PLANNING)
            
            # Görev mesajını hazırla
            task_message = self._build_task_message(description, context)
            
            # Ajan takımını çalıştır
            stream = self.team.run_stream(task=task_message)
            
            full_output = []
            async for message in stream:
                # Mesajları topla
                if hasattr(message, 'content'):
                    full_output.append(str(message.content))
                
                # Callback çağır
                if self.on_message:
                    self.on_message(task_id, message)
                
                # Durum takibi
                if hasattr(message, 'source'):
                    source = message.source
                    if source == "Planner":
                        self._update_status(task_id, TaskStatus.PLANNING)
                    elif source == "Coder":
                        self._update_status(task_id, TaskStatus.CODING)
                    elif source == "Reviewer":
                        self._update_status(task_id, TaskStatus.REVIEWING)
            
            # Sonuçları işle
            task_result.output = "\n".join(full_output)
            task_result.status = TaskStatus.COMPLETED
            
            logger.info(f"Görev tamamlandı: {task_id}")
            
        except Exception as e:
            logger.error(f"Görev hatası: {task_id} - {str(e)}")
            task_result.status = TaskStatus.FAILED
            task_result.errors.append(str(e))
        
        finally:
            task_result.completed_at = datetime.now()
            if task_result.started_at:
                task_result.execution_time = (
                    task_result.completed_at - task_result.started_at
                ).total_seconds()
        
        return task_result
    
    def _build_task_message(
        self,
        description: str,
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """Görev mesajını oluştur"""
        message = f"""GÖREV: {description}

ÇALIŞMA ALANI: {self.workspace_root}
SANDBOX: {'Aktif' if self.sandbox_enabled else 'Pasif'}

"""
        
        if context:
            message += "BAĞLAM:\n"
            for key, value in context.items():
                message += f"- {key}: {value}\n"
        
        message += """
Lütfen aşağıdaki adımları izleyin:
1. Planner: Görevi analiz et ve adım adım plan oluştur
2. Coder: Plana göre kodu yaz ve Sandbox'ta test et
3. Reviewer: Kodu gözden geçir ve onayla/redet

Her adımın çıktısını açıkça belirtin.
"""
        
        return message
    
    def _update_status(self, task_id: str, status: TaskStatus):
        """Görev durumunu güncelle"""
        if task_id in self.active_tasks:
            self.active_tasks[task_id].status = status
            
            # Callback çağır
            if self.on_status_change:
                self.on_status_change(task_id, status)
            
            logger.debug(f"Görev durumu güncellendi: {task_id} -> {status.value}")
    
    def get_task_status(self, task_id: str) -> Optional[TaskResult]:
        """Görev durumunu getir"""
        return self.active_tasks.get(task_id)
    
    def cancel_task(self, task_id: str) -> bool:
        """Görevi iptal et"""
        if task_id in self.active_tasks:
            self.active_tasks[task_id].status = TaskStatus.CANCELLED
            self._update_status(task_id, TaskStatus.CANCELLED)
            logger.info(f"Görev iptal edildi: {task_id}")
            return True
        return False
    
    def list_active_tasks(self) -> List[str]:
        """Aktif görev ID'lerini listele"""
        return [
            task_id for task_id, result in self.active_tasks.items()
            if result.status not in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]
        ]


# Kolay kullanım için factory fonksiyonu
def create_task_manager(
    model_provider: str = "ollama",
    model_name: str = "llama3",
    **kwargs
) -> TaskManager:
    """
    TaskManager örneği oluştur
    
    Args:
        model_provider: Model sağlayıcı
        model_name: Model adı
        **kwargs: Ek parametreler
        
    Returns:
        TaskManager: Yapılandırılmış görev yöneticisi
    """
    return TaskManager(
        model_provider=model_provider,
        model_name=model_name,
        **kwargs
    )
