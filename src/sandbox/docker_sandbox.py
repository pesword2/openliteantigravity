"""
Docker Sandbox - Güvenli Kod Yürütme Ortamı

Bu modül, AI ajanları tarafından üretilen kodun güvenli bir şekilde
çalıştırılması için Docker konteynerleri kullanır.

Özellikler:
- İzole edilmiş çalışma ortamı
- Root yetkisi yok
- Ağ erişimi kapalı (isteğe bağlı)
- Kaynak limiti (CPU, RAM)
- Timeout mekanizması
- Log kaydı
"""

import docker
import json
import logging
import tempfile
import os
import shutil
from typing import Optional, Dict, Any, Tuple
from dataclasses import dataclass
from datetime import datetime

# Logging ayarları
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class SandboxConfig:
    """Sandbox yapılandırma parametreleri"""
    image: str = "python:3.11-slim"
    timeout: int = 30  # saniye
    memory_limit: str = "512m"
    cpu_limit: float = 0.5
    network_enabled: bool = False
    working_dir: str = "/workspace"
    user: str = "nobody"  # root olmayan kullanıcı


@dataclass
class ExecutionResult:
    """Kod yürütme sonucu"""
    success: bool
    stdout: str
    stderr: str
    exit_code: int
    execution_time: float
    error_message: Optional[str] = None


class DockerSandbox:
    """
    Docker tabanlı güvenli kod yürütme sandbox'ı.
    
    Kullanım:
        sandbox = DockerSandbox()
        result = sandbox.execute("print('Hello World')")
        print(result.stdout)
    """
    
    def __init__(self, config: Optional[SandboxConfig] = None):
        self.config = config or SandboxConfig()
        self.client = docker.from_env()
        self.container = None
        self._temp_dir = None
        
    def _create_temp_workspace(self) -> str:
        """Geçici çalışma alanı oluştur"""
        self._temp_dir = tempfile.mkdtemp(prefix="sandbox_")
        logger.info(f"Geçici workspace oluşturuldu: {self._temp_dir}")
        return self._temp_dir
    
    def _cleanup_temp_workspace(self):
        """Geçici çalışma alanını temizle"""
        if self._temp_dir and os.path.exists(self._temp_dir):
            shutil.rmtree(self._temp_dir)
            logger.info(f"Geçici workspace temizlendi: {self._temp_dir}")
            self._temp_dir = None
    
    def _prepare_container(self) -> str:
        """Konteyner hazırla ve ID'sini döndür"""
        temp_dir = self._create_temp_workspace()
        
        # Host'tan konteyner'a bağlanacak klasör
        volume_path = f"{temp_dir}:{self.config.working_dir}"
        
        # Konteyner yapılandırması
        host_config = self.client.api.create_host_config(
            mem_limit=self.config.memory_limit,
            nano_cpus=int(self.config.cpu_limit * 1e9),
            network_mode="none" if not self.config.network_enabled else "bridge",
            binds=[volume_path]
        )
        
        # Konteyner oluştur
        container = self.client.containers.create(
            image=self.config.image,
            command="tail -f /dev/null",  # Konteyner'i açık tut
            working_dir=self.config.working_dir,
            user=self.config.user,
            host_config=host_config,
            detach=True,
            remove=True  # Otomatik temizleme
        )
        
        self.container = container
        logger.info(f"Konteyner oluşturuldu: {container.id[:12]}")
        
        return container.id
    
    def execute(self, code: str, language: str = "python") -> ExecutionResult:
        """
        Kodu güvenli sandbox ortamında çalıştır.
        
        Args:
            code: Çalıştırılacak kod
            language: Programlama dili (şimdilik sadece python)
            
        Returns:
            ExecutionResult: Yürütme sonucu
        """
        if language != "python":
            return ExecutionResult(
                success=False,
                stdout="",
                stderr=f"Dil desteklenmiyor: {language}",
                exit_code=-1,
                execution_time=0,
                error_message=f"Şu anda sadece Python destekleniyor, '{language}' değil."
            )
        
        start_time = datetime.now()
        
        try:
            # Konteyner hazırla
            container_id = self._prepare_container()
            container = self.client.containers.get(container_id)
            
            # Kodu geçici dosyaya yaz
            script_path = os.path.join(self._temp_dir, "script.py")
            with open(script_path, "w", encoding="utf-8") as f:
                f.write(code)
            
            logger.info(f"Kod çalıştırılıyor ({len(code)} karakter)...")
            
            # Kodu çalıştır
            exec_result = container.exec_run(
                cmd=["python", "-u", "script.py"],
                demux=True,
                workdir=self.config.working_dir
            )
            
            end_time = datetime.now()
            execution_time = (end_time - start_time).total_seconds()
            
            # Çıktıları ayrıştır
            stdout = exec_result.output[0].decode('utf-8') if exec_result.output[0] else ""
            stderr = exec_result.output[1].decode('utf-8') if exec_result.output[1] else ""
            
            success = exec_result.exit_code == 0
            
            result = ExecutionResult(
                success=success,
                stdout=stdout,
                stderr=stderr,
                exit_code=exec_result.exit_code,
                execution_time=execution_time,
                error_message=None if success else stderr
            )
            
            logger.info(f"Yürütme tamamlandı: {execution_time:.2f}s, exit_code={exec_result.exit_code}")
            
            return result
            
        except docker.errors.APIError as e:
            end_time = datetime.now()
            execution_time = (end_time - start_time).total_seconds()
            
            logger.error(f"Docker API hatası: {str(e)}")
            return ExecutionResult(
                success=False,
                stdout="",
                stderr=str(e),
                exit_code=-1,
                execution_time=execution_time,
                error_message=f"Docker hatası: {str(e)}"
            )
            
        except Exception as e:
            end_time = datetime.now()
            execution_time = (end_time - start_time).total_seconds()
            
            logger.error(f"Beklenmeyen hata: {str(e)}")
            return ExecutionResult(
                success=False,
                stdout="",
                stderr=str(e),
                exit_code=-1,
                execution_time=execution_time,
                error_message=f"Beklenmeyen hata: {str(e)}"
            )
            
        finally:
            # Konteyner'ı durdur ve temizle
            if self.container:
                try:
                    self.container.stop(timeout=5)
                    logger.info(f"Konteyner durduruldu: {self.container.id[:12]}")
                except Exception as e:
                    logger.warning(f"Konteyner durdurma hatası: {e}")
                finally:
                    self.container = None
            
            # Geçici workspace'i temizle
            self._cleanup_temp_workspace()
    
    def execute_with_timeout(self, code: str, language: str = "python") -> ExecutionResult:
        """
        Timeout korumalı kod yürütme.
        
        Bu metod, belirtilen timeout süresinden uzun süren
        işlemleri otomatik olarak sonlandırır.
        """
        import signal
        from contextlib import contextmanager
        
        @contextmanager
        def timeout_context(seconds: int):
            def timeout_handler(signum, frame):
                raise TimeoutError(f"Kod yürütme {seconds} saniyeyi aştı")
            
            old_handler = signal.signal(signal.SIGALRM, timeout_handler)
            signal.alarm(seconds)
            try:
                yield
            finally:
                signal.alarm(0)
                signal.signal(signal.SIGALRM, old_handler)
        
        try:
            with timeout_context(self.config.timeout):
                return self.execute(code, language)
        except TimeoutError as e:
            return ExecutionResult(
                success=False,
                stdout="",
                stderr=str(e),
                exit_code=-1,
                execution_time=self.config.timeout,
                error_message=str(e)
            )
    
    def health_check(self) -> bool:
        """Docker daemon'ın çalışıp çalışmadığını kontrol et"""
        try:
            self.client.ping()
            logger.info("Docker daemon çalışıyor")
            return True
        except Exception as e:
            logger.error(f"Docker daemon hatası: {e}")
            return False
    
    def get_system_info(self) -> Dict[str, Any]:
        """Sistem bilgilerini döndür"""
        try:
            info = self.client.info()
            return {
                "docker_version": info.get("ServerVersion", "unknown"),
                "containers_running": info.get("ContainersRunning", 0),
                "os_type": info.get("OSType", "unknown"),
                "architecture": info.get("Architecture", "unknown"),
                "memory_total": info.get("MemTotal", 0),
                "cpus": info.get("NCPU", 0)
            }
        except Exception as e:
            logger.error(f"Sistem bilgisi alınamadı: {e}")
            return {"error": str(e)}


# Örnek kullanım
if __name__ == "__main__":
    print("=" * 60)
    print("Docker Sandbox Test")
    print("=" * 60)
    
    sandbox = DockerSandbox(SandboxConfig(timeout=10))
    
    # Sağlık kontrolü
    if not sandbox.health_check():
        print("❌ Docker çalışmıyor!")
        exit(1)
    
    print("✅ Docker çalışıyor")
    
    # Sistem bilgisi
    info = sandbox.get_system_info()
    print(f"\n📊 Sistem Bilgisi:")
    for key, value in info.items():
        print(f"   {key}: {value}")
    
    # Test 1: Basit Python kodu
    print("\n" + "=" * 60)
    print("Test 1: Basit Python Kodu")
    print("=" * 60)
    
    test_code_1 = """
print("Merhaba Dünya!")
for i in range(5):
    print(f"Sayı: {i}")
"""
    
    result = sandbox.execute(test_code_1)
    print(f"Başarılı: {result.success}")
    print(f"Çıktı:\n{result.stdout}")
    if result.stderr:
        print(f"Hata:\n{result.stderr}")
    print(f"Süre: {result.execution_time:.2f}s")
    
    # Test 2: Hatalı kod
    print("\n" + "=" * 60)
    print("Test 2: Hatalı Kod")
    print("=" * 60)
    
    test_code_2 = """
print("Başlıyor...")
x = 1 / 0  # Sıfıra bölme hatası
"""
    
    result = sandbox.execute(test_code_2)
    print(f"Başarılı: {result.success}")
    print(f"Çıktı:\n{result.stdout}")
    if result.stderr:
        print(f"Hata:\n{result.stderr}")
    
    # Test 3: Dosya sistemi erişimi
    print("\n" + "=" * 60)
    print("Test 3: Dosya Sistemi Erişimi")
    print("=" * 60)
    
    test_code_3 = """
import os

# Mevcut dizini listele
print("Dosyalar:", os.listdir("."))

# Yeni dosya oluştur
with open("test.txt", "w") as f:
    f.write("Test içerik")

# Dosyayı oku
with open("test.txt", "r") as f:
    print("Okunan:", f.read())
"""
    
    result = sandbox.execute(test_code_3)
    print(f"Başarılı: {result.success}")
    print(f"Çıktı:\n{result.stdout}")
    
    print("\n" + "=" * 60)
    print("Tüm testler tamamlandı!")
    print("=" * 60)
