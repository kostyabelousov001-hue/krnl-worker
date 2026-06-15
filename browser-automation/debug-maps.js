const { chromium } = require('playwright');
(async () => {
    const b = await chromium.launch({ headless: true });
    const page = await b.newPage();
    // Берём Metropolitan — у них точно есть отзывы (рейтинг 4.7)
    const url = 'https://www.google.com/maps/search/Metropolitan+Premium+Properties+Dubai';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await page.waitForTimeout(3000);
    const hasH1 = await page.locator('h1').count().then(c => c > 0).catch(() => false);
    if (!hasH1) {
        const first = page.locator('a[href*="/maps/place/"]').first();
        const href = await first.getAttribute('href').catch(() => null);
        if (!href) {
            console.log('No href and no H1 found. Current URL:', page.url());
            await b.close();
            return;
        }
        console.log('Going to:', href.split('?')[0]);
        await page.goto(href.split('?')[0], { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    } else {
        console.log('Already on place page. Current URL:', page.url());
    }
    await page.waitForSelector('h1', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const d = await page.evaluate(() => {
        const h1 = document.querySelector('h1');
        const f7 = document.querySelector('div.F7nice');
        const allAriaLabels = [...document.querySelectorAll('[aria-label]')]
            .filter(el => /\d/.test(el.getAttribute('aria-label')) && el.getAttribute('aria-label').length < 120)
            .slice(0, 10)
            .map(el => ({ tag: el.tagName, label: el.getAttribute('aria-label') }));
        return {
            h1Text: h1 ? h1.textContent.trim() : 'NO H1',
            h1Class: h1 ? h1.className : '',
            f7Text: f7 ? f7.textContent.trim() : 'NO F7nice',
            allAriaLabels
        };
    });
    console.log(JSON.stringify(d, null, 2));
    await b.close();
})();
