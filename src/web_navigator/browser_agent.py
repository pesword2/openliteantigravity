"""
Browser Agent - Web Navigator için AI Agent Entegrasyonu

Bu modül, WebNavigator'ı AI ajanlarıyla entegre eder.
Ajanlar doğal dil komutlarıyla web işlemleri yapabilir.
"""

import asyncio
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
import json
import logging

from .navigator import WebNavigator, NavigationResult, FormField

logger = logging.getLogger(__name__)


@dataclass
class BrowserAction:
    """Tarayıcı eylemi"""
    action_type: str  # navigate, click, fill, extract, screenshot
    target: Optional[str] = None  # URL veya selector
    value: Optional[str] = None  # Form değeri veya JS
    options: Optional[Dict[str, Any]] = None


@dataclass
class BrowserTask:
    """Tarayıcı görevi"""
    description: str
    actions: List[BrowserAction]
    expected_output: Optional[str] = None


class BrowserAgent:
    """
    AI ajanları için browser otomasyon katmanı.
    
    Bu sınıf, AI ajanlarının doğal dil komutlarını
    browser işlemlerine dönüştürür ve yürütür.
    """
    
    def __init__(self, navigator: Optional[WebNavigator] = None):
        self.navigator = navigator or WebNavigator()
        self.action_history: List[BrowserAction] = []
        self.result_cache: Dict[str, Any] = {}
    
    async def start(self):
        """Browser'ı başlat"""
        await self.navigator.start()
        logger.info("Browser Agent başlatıldı")
    
    async def close(self):
        """Browser'ı kapat"""
        await self.navigator.close()
        logger.info("Browser Agent kapatıldı")
    
    async def execute_action(self, action: BrowserAction) -> Any:
        """
        Tek bir browser eylemini yürüt
        
        Args:
            action: BrowserAction
        
        Returns:
            Any: Eylem sonucu
        """
        self.action_history.append(action)
        logger.info(f"Eylem: {action.action_type} - {action.target}")
        
        if action.action_type == "navigate":
            result = await self.navigator.navigate(
                action.target,
                **(action.options or {})
            )
            self.result_cache["last_navigation"] = result
            return result
        
        elif action.action_type == "click":
            await self.navigator.click(action.target)
            return {"success": True, "selector": action.target}
        
        elif action.action_type == "fill":
            fields = [FormField(
                selector=action.target,
                value=action.value,
                field_type=(action.options or {}).get("field_type", "text")
            )]
            await self.navigator.fill_form(fields)
            return {"success": True, "field": action.target, "value": "***"}
        
        elif action.action_type == "extract_text":
            text = await self.navigator.extract_text(action.target)
            self.result_cache["last_extracted_text"] = text
            return {"text": text, "length": len(text)}
        
        elif action.action_type == "extract_markdown":
            md = await self.navigator.extract_markdown()
            self.result_cache["last_extracted_md"] = md
            return {"markdown": md, "length": len(md)}
        
        elif action.action_type == "screenshot":
            screenshot = await self.navigator.screenshot(
                full_page=(action.options or {}).get("full_page", True)
            )
            self.result_cache["last_screenshot"] = screenshot
            return {"size": len(screenshot), "format": "png"}
        
        elif action.action_type == "evaluate":
            result = await self.navigator.evaluate(action.value)
            return {"result": result}
        
        elif action.action_type == "wait":
            await self.navigator.wait_for_selector(
                action.target,
                timeout=(action.options or {}).get("timeout")
            )
            return {"success": True, "selector": action.target}
        
        else:
            raise ValueError(f"Bilinmeyen eylem: {action.action_type}")
    
    async def execute_task(self, task: BrowserTask) -> List[Any]:
        """
        Çoklu eylem görevini yürüt
        
        Args:
            task: BrowserTask
        
        Returns:
            List[Any]: Her eylemin sonuçları
        """
        logger.info(f"Görev başlatılıyor: {task.description}")
        results = []
        
        for action in task.actions:
            try:
                result = await self.execute_action(action)
                results.append({"success": True, "result": result})
            except Exception as e:
                logger.error(f"Eylem başarısız: {e}")
                results.append({"success": False, "error": str(e)})
                
                # Kritik hata ise dur
                if (action.options or {}).get("critical", False):
                    break
        
        return results
    
    async def navigate_and_extract(self, url: str, extract_type: str = "markdown") -> Dict[str, Any]:
        """
        URL'ye git ve içerik çıkar
        
        Args:
            url: Hedef URL
            extract_type: 'markdown', 'text', veya 'html'
        
        Returns:
            Dict: İçerik ve metadata
        """
        task = BrowserTask(
            description=f"{url} adresinden içerik çıkar",
            actions=[
                BrowserAction(action_type="navigate", target=url),
                BrowserAction(action_type=f"extract_{extract_type}")
            ]
        )
        
        results = await self.execute_task(task)
        
        if all(r["success"] for r in results):
            content_result = results[1]["result"]
            return {
                "success": True,
                "url": url,
                "content": content_result.get(extract_type, ""),
                "length": content_result.get("length", 0)
            }
        else:
            return {
                "success": False,
                "errors": [r.get("error") for r in results if not r["success"]]
            }
    
    async def search_and_extract(
        self,
        query: str,
        search_engine: str = "https://www.google.com/search?q=",
        result_index: int = 0,
        extract_type: str = "markdown"
    ) -> Dict[str, Any]:
        """
        Arama yap ve ilk sonuçtan içerik çıkar
        
        Args:
            query: Arama sorgusu
            search_engine: Arama motoru URL şablonu
            result_index: Hangi sonuç (0 = ilk)
            extract_type: Çıkarma tipi
        
        Returns:
            Dict: İçerik ve metadata
        """
        from urllib.parse import quote
        
        search_url = search_engine + quote(query)
        
        # Arama sayfasına git
        nav_result = await self.navigator.navigate(search_url)
        
        # Sonuç linklerini bul (Google için basit selector)
        if "google" in search_engine:
            selectors = [
                "div.g a",
                "h3 a",
                ".yuRUbf a"
            ]
        else:
            selectors = ["a[href]"]
        
        links = []
        for selector in selectors:
            try:
                links = await self.navigator.evaluate(f"""
                    () => {{
                        const elements = document.querySelectorAll('{selector}');
                        return Array.from(elements)
                            .map(a => a.href)
                            .filter(href => href.startsWith('http'));
                    }}
                """)
                if links:
                    break
            except:
                continue
        
        if not links or result_index >= len(links):
            return {
                "success": False,
                "error": "Sonuç bulunamadı"
            }
        
        target_url = links[result_index]
        
        # Hedef URL'ye git ve içerik çıkar
        return await self.navigate_and_extract(target_url, extract_type)
    
    def get_action_history(self) -> List[Dict[str, Any]]:
        """Eylem geçmişini al"""
        return [
            {
                "action": a.action_type,
                "target": a.target,
                "timestamp": i
            }
            for i, a in enumerate(self.action_history)
        ]
    
    def clear_history(self):
        """Geçmişi temizle"""
        self.action_history.clear()
        self.result_cache.clear()


async def main():
    """Test örneği"""
    agent = BrowserAgent()
    
    try:
        await agent.start()
        
        # Test 1: Basit navigasyon ve içerik çıkarma
        print("\n=== Test 1: Navigasyon ve Markdown Çıkarma ===")
        result = await agent.navigate_and_extract(
            "https://example.com",
            extract_type="markdown"
        )
        print(f"Başarılı: {result['success']}")
        if result['success']:
            print(f"İçerik uzunluğu: {result['length']} karakter")
        
        # Test 2: Eylem geçmişi
        print("\n=== Test 2: Eylem Geçmişi ===")
        history = agent.get_action_history()
        for h in history:
            print(f"  - {h['action']}: {h['target']}")
        
        # Test 3: Özel görev
        print("\n=== Test 3: Özel Görev ===")
        task = BrowserTask(
            description="GitHub trending'e git ve başlığı al",
            actions=[
                BrowserAction(
                    action_type="navigate",
                    target="https://github.com/trending"
                ),
                BrowserAction(
                    action_type="extract_text",
                    target="h1"
                )
            ]
        )
        
        results = await agent.execute_task(task)
        for i, r in enumerate(results):
            print(f"  Adım {i}: {'✓' if r['success'] else '✗'}")
            if r['success']:
                print(f"    Sonuç: {str(r['result'])[:100]}...")
        
    finally:
        await agent.close()


if __name__ == "__main__":
    asyncio.run(main())
