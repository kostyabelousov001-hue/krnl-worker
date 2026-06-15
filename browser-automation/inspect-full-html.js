const { chromium } = require('playwright');
(async () => {
    const b = await chromium.launch({ headless: true });
    const page = await b.newPage();
    const url = 'https://www.google.com/maps/search/restaurants+in+Business+Bay+Dubai';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(5000);

    // Consent popup
    try {
        const consent = page.locator('button:has-text("Reject all"), button:has-text("Accept all"), button:has-text("Принять"), button:has-text("Отклонить")');
        if (await consent.count() > 0) {
            await consent.first().click({ timeout: 3000 });
            await page.waitForTimeout(1000);
        }
    } catch (e) {}

    const html = await page.evaluate(() => {
        const card = document.querySelector('a[href*="/maps/place/"]');
        if (card) {
            const container = card.closest('div[role="article"]') || card.closest('.Nv2PK') || card.parentElement;
            return container ? container.innerHTML : 'NO CONTAINER';
        }
        return 'NO CARD';
    });

    console.log(html);
    await b.close();
})();
