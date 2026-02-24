const express = require('express');
const { chromium } = require('playwright');
const app = express();
const port = process.env.PORT || 14200;

app.use(express.json());

let browser;
let context;
let page;

async function ensureBrowser() {
    if (!browser) {
        browser = await chromium.launch({ headless: true });
        context = await browser.newContext({
            viewport: { width: 1280, height: 720 }
        });
        page = await context.newPage();
    }
}

app.post('/v1/browser/navigate', async (req, res) => {
    try {
        const { url } = req.body;
        await ensureBrowser();
        await page.goto(url, { waitUntil: 'networkidle' });
        res.json({ success: true, url: page.url() });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/v1/browser/content', async (req, res) => {
    try {
        await ensureBrowser();
        const content = await page.content();
        const text = await page.innerText('body');
        res.json({ url: page.url(), content, text });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/v1/browser/screenshot', async (req, res) => {
    try {
        await ensureBrowser();
        const buffer = await page.screenshot({ fullPage: true });
        res.set('Content-Type', 'image/png');
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/v1/browser/click', async (req, res) => {
    try {
        const { selector } = req.body;
        await ensureBrowser();
        await page.click(selector);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/v1/browser/type', async (req, res) => {
    try {
        const { selector, text } = req.body;
        await ensureBrowser();
        await page.fill(selector, text);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', browser: !!browser });
});

app.listen(port, () => {
    console.log(`Browser service listening on port ${port}`);
});
