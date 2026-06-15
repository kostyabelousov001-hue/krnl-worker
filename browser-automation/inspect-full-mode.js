const { chromium } = require('playwright');
(async () => {
    // Запускаем БЕЗ флага --disable-gpu
    const b = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    const page = await b.newPage();
    const url = 'https://www.google.com/maps/place/Metropolitan+Premium+Properties/@25.1839733,55.2594894,17z/data=!3m1!4b1!4m6!3m5!1s0x3e5f699d2560be17:0xf5856d2bee96f8aa!8m2!3d25.1839733!4d55.2594894!16s%2Fg%2F11h547xjnq';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.waitForSelector('h1', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(4000);

    const data = await page.evaluate(() => {
        return {
            title: document.title,
            bodyText: document.body.innerText ? document.body.innerText.slice(0, 1500) : 'NO TEXT',
            allSpans: Array.from(document.querySelectorAll('span')).map(s => s.textContent.trim()).filter(t => t.length > 0 && t.length < 50).slice(0, 30)
        };
    });

    console.log(JSON.stringify(data, null, 2));
    await b.close();
})();
