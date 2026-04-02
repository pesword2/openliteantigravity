#!/usr/bin/env python3
"""
API Gateway Başlatma Scripti
FastAPI sunucusunu çalıştırır.
"""

import subprocess
import sys
import os

def check_dependencies():
    """Gerekli Python paketlerinin yüklü olup olmadığını kontrol eder."""
    try:
        import fastapi
        import uvicorn
        print("✓ Tüm bağımlılıklar mevcut")
        return True
    except ImportError as e:
        print(f"✗ Eksik bağımlılık: {e}")
        print("Kurulum için: pip install -r requirements.txt")
        return False

def start_server(host="0.0.0.0", port=8000):
    """API sunucusunu başlatır."""
    print(f"\n🚀 OpenLiteAntigravity API Gateway başlatılıyor...")
    print(f"📡 Sunucu adresi: http://{host}:{port}")
    print(f"📚 API Dokümantasyonu: http://{host}:{port}/docs")
    print(f"❤️  Health Check: http://{host}:{port}/health\n")
    
    try:
        import uvicorn
        uvicorn.run(
            "main:app",
            host=host,
            port=port,
            reload=True,
            log_level="info"
        )
    except Exception as e:
        print(f"✗ Sunucu başlatma hatası: {e}")
        sys.exit(1)

if __name__ == "__main__":
    # Çalışma dizinini script'in olduğu klasöre ayarla
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    if check_dependencies():
        start_server()
    else:
        sys.exit(1)
