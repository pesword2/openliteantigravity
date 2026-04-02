"""
Web Navigator - Playwright Tabanlı Web Otomasyonu

Bu modül, AI ajanlarının web'de gezinmesi, doküman okuması,
form doldurması ve veri çekmesi için Playwright entegrasyonu sağlar.
"""

import asyncio
from typing import Optional, List, Dict, Any
from playwright.async_api import async_playwright, Page, Browser, BrowserContext
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class NavigationResult:
    """Navigasyon sonucu"""
    url: str
    status_code: int
    title: str
    content: str
    links: List[str]
    screenshots: Optional[bytes] = None


@dataclass
class FormField:
    """Form alanı tanımı"""
    selector: str
    value: str
    field_type: str = "text"


class WebNavigator:
    """
    Playwright tabanlı asenkron web navigator.
    
    Özellikler:
    - Headless/Headful mod
    - JavaScript rendering
    - Cookie yönetimi
    - Screenshot alma
    - Form otomasyonu
    - İçerik çıkarma
    """
    
    def __init__(
        self,
        headless: bool = True,
        timeout: int = 30000,
        user_agent: Optional[str] = None,
        proxy: Optional[Dict[str, str]] = None
    ):
        self.headless = headless
        self.timeout = timeout
        self.user_agent = user_agent or (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
        self.proxy = proxy
        
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self._playwright = None
    
    async def start(self):
        """Browser'ı başlat"""
        if self._playwright is None:
            self._playwright = await async_playwright().start()
        
        browser_args = {
            "headless": self.headless,
            "args": [
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-web-security",
                "--disable-features=IsolateOrigins,site-per-process"
            ]
        }
        
        if self.user_agent:
            browser_args["user_agent"] = self.user_agent
        
        self.browser = await self._playwright.chromium.launch(**browser_args)
        
        context_options = {
            "viewport": {"width": 1920, "height": 1080},
            "timeout": self.timeout
        }
        
        if self.proxy:
            context_options["proxy"] = self.proxy
        
        self.context = await self.browser.new_context(**context_options)
        self.page = await self.context.new_page()
        
        logger.info("Browser başlatıldı")
    
    async def close(self):
        """Browser'ı kapat"""
        if self.page:
            await self.page.close()
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self._playwright:
            await self._playwright.stop()
        
        logger.info("Browser kapatıldı")
    
    async def navigate(self, url: str, wait_until: str = "networkidle") -> NavigationResult:
        """
        URL'ye git ve sayfa içeriğini al
        
        Args:
            url: Hedef URL
            wait_until: 'load', 'domcontentloaded', 'networkidle', 'commit'
        
        Returns:
            NavigationResult: Sayfa bilgileri
        """
        if not self.page:
            await self.start()
        
        logger.info(f"Navigasyon: {url}")
        
        response = await self.page.goto(url, wait_until=wait_until)
        
        # Başlık al
        title = await self.page.title()
        
        # İçerik al (HTML)
        content = await self.page.content()
        
        # Tüm linkleri topla
        links = await self.page.evaluate("""
            () => {
                return Array.from(document.querySelectorAll('a[href]'))
                    .map(a => a.href)
                    .filter((v, i, a) => a.indexOf(v) === i);
            }
        """)
        
        status_code = response.status if response else 0
        
        result = NavigationResult(
            url=url,
            status_code=status_code,
            title=title,
            content=content,
            links=links[:50]  # İlk 50 link
        )
        
        logger.info(f"Sayfa yüklendi: {title} ({status_code})")
        return result
    
    async def extract_text(self, selector: Optional[str] = None) -> str:
        """
        Sayfadan metin çıkar
        
        Args:
            selector: Belirli bir element seçici (opsiyonel)
        
        Returns:
            str: Çıkarılan metin
        """
        if not self.page:
            raise RuntimeError("Browser başlatılmamış")
        
        if selector:
            element = await self.page.query_selector(selector)
            if element:
                text = await element.inner_text()
            else:
                text = ""
        else:
            # Tüm sayfa metni
            text = await self.page.evaluate("""
                () => document.body.innerText
            """)
        
        return text.strip()
    
    async def extract_markdown(self) -> str:
        """
        Sayfa içeriğini Markdown formatına dönüştür
        
        Returns:
            str: Markdown içeriği
        """
        if not self.page:
            raise RuntimeError("Browser başlatılmamış")
        
        # Basit HTML to Markdown dönüşümü
        markdown = await self.page.evaluate("""
            () => {
                function htmlToMarkdown(element) {
                    let markdown = '';
                    
                    function processNode(node) {
                        if (node.nodeType === 3) { // Text node
                            const text = node.textContent.trim();
                            if (text) markdown += text + ' ';
                        } else if (node.nodeType === 1) { // Element node
                            const tag = node.tagName.toLowerCase();
                            
                            if (tag === 'h1') markdown += '# ';
                            else if (tag === 'h2') markdown += '## ';
                            else if (tag === 'h3') markdown += '### ';
                            else if (tag === 'h4') markdown += '#### ';
                            else if (tag === 'h5') markdown += '##### ';
                            else if (tag === 'h6') markdown += '###### ';
                            else if (tag === 'p') markdown += '\\n\\n';
                            else if (tag === 'br') markdown += '\\n';
                            else if (tag === 'hr') markdown += '\\n---\\n';
                            else if (tag === 'strong' || tag === 'b') markdown += '**';
                            else if (tag === 'em' || tag === 'i') markdown += '*';
                            else if (tag === 'code') markdown += '`';
                            else if (tag === 'pre') markdown += '\\n```\\n';
                            else if (tag === 'ul' || tag === 'ol') markdown += '\\n';
                            else if (tag === 'li') markdown += '- ';
                            else if (tag === 'a') {
                                if (node.textContent && node.href) {
                                    markdown += '[' + node.textContent + '](' + node.href + ')';
                                    return;
                                }
                            }
                            
                            for (let child of node.childNodes) {
                                processNode(child);
                            }
                            
                            if (tag === 'strong' || tag === 'b') markdown += '**';
                            else if (tag === 'em' || tag === 'i') markdown += '*';
                            else if (tag === 'code') markdown += '`';
                            else if (tag === 'pre') markdown += '\\n```\\n';
                            else if (tag === 'p') markdown += '\\n';
                            else if (tag === 'h1' || tag === 'h2' || tag === 'h3' || 
                                     tag === 'h4' || tag === 'h5' || tag === 'h6') {
                                markdown += '\\n\\n';
                            }
                        }
                    }
                    
                    processNode(element);
                    return markdown.replace(/\\n{3,}/g, '\\n\\n').trim();
                }
                
                return htmlToMarkdown(document.body);
            }
        """)
        
        return markdown
    
    async def fill_form(self, fields: List[FormField]) -> None:
        """
        Form alanlarını doldur
        
        Args:
            fields: FormField listesi
        """
        if not self.page:
            raise RuntimeError("Browser başlatılmamış")
        
        for field in fields:
            if field.field_type == "text":
                await self.page.fill(field.selector, field.value)
            elif field.field_type == "select":
                await self.page.select_option(field.selector, field.value)
            elif field.field_type == "checkbox":
                if field.value.lower() in ["true", "yes", "1"]:
                    await self.page.check(field.selector)
                else:
                    await self.page.uncheck(field.selector)
            elif field.field_type == "radio":
                await self.page.check(field.selector)
        
        logger.info(f"{len(fields)} form alanı dolduruldu")
    
    async def click(self, selector: str) -> None:
        """
        Elemente tıkla
        
        Args:
            selector: CSS seçici
        """
        if not self.page:
            raise RuntimeError("Browser başlatılmamış")
        
        await self.page.click(selector)
        logger.info(f"Tıklandı: {selector}")
    
    async def screenshot(self, full_page: bool = True) -> bytes:
        """
        Sayfa ekran görüntüsü al
        
        Args:
            full_page: Tüm sayfayı çek
        
        Returns:
            bytes: PNG görüntü
        """
        if not self.page:
            raise RuntimeError("Browser başlatılmamış")
        
        screenshot = await self.page.screenshot(full_page=full_page)
        logger.info("Ekran görüntüsü alındı")
        return screenshot
    
    async def wait_for_selector(self, selector: str, timeout: Optional[int] = None) -> None:
        """
        Belirli bir elementin görünmesini bekle
        
        Args:
            selector: CSS seçici
            timeout: Maksimum bekleme süresi (ms)
        """
        if not self.page:
            raise RuntimeError("Browser başlatılmamış")
        
        await self.page.wait_for_selector(selector, timeout=timeout or self.timeout)
    
    async def evaluate(self, javascript: str) -> Any:
        """
        Sayfa üzerinde JavaScript çalıştır
        
        Args:
            javascript: Çalıştırılacak JS kodu
        
        Returns:
            Any: JS dönüş değeri
        """
        if not self.page:
            raise RuntimeError("Browser başlatılmamış")
        
        return await self.page.evaluate(javascript)
    
    async def get_cookies(self) -> List[Dict[str, Any]]:
        """Cookie'leri al"""
        if not self.context:
            raise RuntimeError("Browser başlatılmamış")
        
        cookies = await self.context.cookies()
        return cookies
    
    async def set_cookies(self, cookies: List[Dict[str, Any]]) -> None:
        """
        Cookie'leri ayarla
        
        Args:
            cookies: Cookie listesi
        """
        if not self.context:
            raise RuntimeError("Browser başlatılmamış")
        
        await self.context.add_cookies(cookies)
        logger.info(f"{len(cookies)} cookie eklendi")


async def main():
    """Test örneği"""
    navigator = WebNavigator(headless=True)
    
    try:
        await navigator.start()
        
        # GitHub'a git
        result = await navigator.navigate("https://github.com/trending")
        print(f"Başlık: {result.title}")
        print(f"Status: {result.status_code}")
        print(f"Link sayısı: {len(result.links)}")
        
        # Metin çıkar
        text = await navigator.extract_text()
        print(f"Metin uzunluğu: {len(text)} karakter")
        
        # Markdown çıkar
        md = await navigator.extract_markdown()
        print(f"Markdown uzunluğu: {len(md)} karakter")
        
        # Ekran görüntüsü
        screenshot = await navigator.screenshot()
        print(f"Screenshot boyutu: {len(screenshot)} bytes")
        
    finally:
        await navigator.close()


if __name__ == "__main__":
    asyncio.run(main())
