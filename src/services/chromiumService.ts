import { chromium, Browser } from 'playwright';

let _browser: Browser | null = null;



async function initBrowser() {
  if (!_browser) {
    _browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-sandbox',
      ]
    });
  }
}

async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

async function getPage() {
  await initBrowser();
  if (!_browser) throw new Error('Browser failed to initialize');
  return await _browser.newPage();
}

export {
  initBrowser,
  closeBrowser,
  getPage
}