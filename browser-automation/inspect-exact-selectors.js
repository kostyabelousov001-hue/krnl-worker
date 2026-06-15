const { chromium } = require('playwright');
(async () => {
    const b = await chromium.launch({ headless: true });
    const context = await b.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();
    const url = 'https://www.google.com/maps/place/Metropolitan+Premium+Properties/@25.1839733,55.2594894,17z/data=!3m1!4b1!4m6!3m5!1s0x3e5f699d2560be17:0xf5856d2bee96f8aa!8m2!3d25.1839733!4d55.2594894!16s%2Fg%2F11h547xjnq';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.waitForSelector('h1', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(4000);

    const data = await page.evaluate(() => {
        // Находим span с рейтингом
        const ratingSpan = document.querySelector('span.ceNzKf') || document.querySelector('[class*="ceNzKf"]');
        let parentHTML = 'NOT FOUND';
        let grandParentHTML = 'NOT FOUND';
        if (ratingSpan) {
            parentHTML = ratingSpan.parentElement ? ratingSpan.parentElement.outerHTML.slice(0, 1000) : 'NO PARENT';
            grandParentHTML = ratingSpan.parentElement?.parentElement ? ratingSpan.parentElement.parentElement.outerHTML.slice(0, 1000) : 'NO GRANDPARENT';
        }
        return {
            ratingSpanExists: !!ratingSpan,
            ratingSpanHTML: ratingSpan ? ratingSpan.outerHTML : 'NOT FOUND',
            parentHTML,
            grandParentHTML
        };
    });

    console.log(JSON.stringify(data, null, 2));
    await b.close();
})();
