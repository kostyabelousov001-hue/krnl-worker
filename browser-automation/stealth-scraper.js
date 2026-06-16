const { chromium } = require('playwright');

function cleanText(text) {
    if (!text) return 'N/A';
    const noIcons = text.replace(/[\uE000-\uF8FF]/g, '');
    return noIcons.replace(/\s+/g, ' ').trim();
}

function extractEmailsFromString(content) {
    if (!content) return [];
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matched = content.match(emailRegex);
    if (!matched) return [];
    return [...new Set(matched)].filter(email => {
        const ext = email.split('.').pop().toLowerCase();
        return !['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'css', 'js'].includes(ext);
    });
}

async function setupResourceBlocking(page, blockStylesheets = true) {
    await page.route('**/*', (route) => {
        const type = route.request().resourceType();
        const blockTypes = ['image', 'media', 'font', 'other', 'ping', 'csp_report', 'imageset'];
        if (blockStylesheets) blockTypes.push('stylesheet');
        if (blockTypes.includes(type)) route.abort();
        else route.continue();
    });
}

async function extractSocialsFromPage(page) {
    const data = { facebook: '', instagram: '', linkedin: '' };
    try {
        const links = await page.locator('a').evaluateAll(anchors =>
            anchors.map(a => a.href).filter(href => href && href.startsWith('http'))
        ).catch(() => []);
        for (const link of links) {
            if (link.includes('facebook.com') && !data.facebook) data.facebook = link;
            else if (link.includes('instagram.com') && !data.instagram) data.instagram = link;
            else if (link.includes('linkedin.com') && !data.linkedin) data.linkedin = link;
        }
    } catch (e) {}
    return data;
}

async function findContactDetails(browser, url) {
    const data = { emails: [], facebook: '', instagram: '', linkedin: '' };
    if (!url || url === 'N/A') return data;

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();
    try {
        await setupResourceBlocking(page, true);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 4000 }).catch(() => {});

        let content = await page.content().catch(() => '');
        let matched = extractEmailsFromString(content);
        if (matched.length > 0) data.emails.push(...matched);

        const socials = await extractSocialsFromPage(page);
        data.facebook = socials.facebook;
        data.instagram = socials.instagram;
        data.linkedin = socials.linkedin;

        if (data.emails.length === 0) {
            const contactUrl = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                const keywords = ['contact', 'about', 'контакт', 'о нас', 'support', 'help', 'career'];
                const found = links.find(a => {
                    const text = a.textContent.toLowerCase();
                    const href = a.getAttribute('href') || '';
                    return keywords.some(kw => text.includes(kw) || href.toLowerCase().includes(kw));
                });
                return found ? found.href : null;
            }).catch(() => null);

            if (contactUrl && contactUrl.startsWith('http')) {
                await page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: 3000 }).catch(() => {});
                const contactContent = await page.content().catch(() => '');
                const contactEmails = extractEmailsFromString(contactContent);
                if (contactEmails.length > 0) data.emails.push(...contactEmails);
            }
        }
        data.emails = [...new Set(data.emails)];
    } catch (err) {
    } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
    }
    return data;
}

async function extractPlaceDetails(browser, input) {
    const preRating   = (typeof input === 'object') ? input.rating   : null;
    const preReviews  = (typeof input === 'object') ? input.reviews  : null;
    const url         = (typeof input === 'object') ? input.url      : input;

    const data = { name: 'N/A', rating: preRating || 'N/A', reviews: preReviews || '0', phone: 'N/A', website: 'N/A', url };
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();
    try {
        await setupResourceBlocking(page, true);
        const cleanUrl = url.includes('?') ? url.split('?')[0] : url;
        await page.goto(cleanUrl, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
        await page.waitForSelector('h1', { timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(300);

        const name = await page.evaluate(() => {
            const h1 = document.querySelector('h1.DUwDvf, h1[class*="DUwDvf"], h1');
            return (h1 && h1.textContent.trim().length > 1) ? h1.textContent.trim() : null;
        }).catch(() => null);

        if (name && name.length > 1) {
            data.name = cleanText(name);
            const phone = await page.locator(
                'button[data-item-id^="phone:tel:"] div.fontBodyMedium, button[data-item-id^="phone:"] div.fontBodyMedium'
            ).first().textContent({ timeout: 1000 }).catch(() => 'N/A');

            const website = await page.locator(
                'a[data-item-id="authority"] div.fontBodyMedium, a[data-item-id="authority"]'
            ).first().textContent({ timeout: 1000 }).catch(() => 'N/A');

            data.phone   = cleanText(phone);
            data.website = cleanText(website);

            if (data.rating === 'N/A' || data.reviews === '0' || data.reviews === 'N/A') {
                const rd = await page.evaluate(() => {
                    const f7 = document.querySelector('div.F7nice');
                    if (f7) {
                        const t = f7.textContent;
                        const rM = t.match(/(\d[.,]\d)/);
                        const rvM = t.match(/\((\d[\d\s,.]+)\)/);
                        return { rating: rM?.[1]?.replace(',', '.') || null, reviews: rvM?.[1]?.replace(/\D/g, '') || null };
                    }
                    const btn = document.querySelector('button[aria-label*="star"], button[aria-label*="звезд"], button[aria-label*="rəy"], button[aria-label*="review"], button[aria-label*="ulduz"]');
                    if (btn) {
                        const l = btn.getAttribute('aria-label') || '';
                        const rM = l.match(/(\d[.,]\d)/);
                        const rvM = l.match(/(\d[\d\s,.]+)\s*(?:отзыв|review|rəy|şərh)/i);
                        return { rating: rM?.[1]?.replace(',', '.') || null, reviews: rvM?.[1]?.replace(/\D/g, '') || null };
                    }
                    return { rating: null, reviews: null };
                }).catch(() => ({ rating: null, reviews: null }));
                if (rd.rating && data.rating === 'N/A') { const n = parseFloat(rd.rating); if (!isNaN(n) && n >= 1 && n <= 5) data.rating = rd.rating; }
                if (rd.reviews && (data.reviews === '0' || data.reviews === 'N/A')) data.reviews = rd.reviews;
            }
        }
    } catch (err) {
    } finally {
        await page.close().catch(() => {});
        await context.close().catch(() => {});
    }
    return data;
}

async function scrollFeed(page) {
    await page.evaluate(async () => {
        const feed = document.querySelector('div[role="feed"]');
        if (feed) {
            for (let j = 0; j < 10; j++) {
                feed.scrollBy(0, 600);
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            feed.scrollTop = feed.scrollHeight;
        }
    }).catch(() => {});
}

async function extractPlaceDetailsBatch(browser, inputs, concurrency = 3) {
    const results = [];
    for (let i = 0; i < inputs.length; i += concurrency) {
        const chunk = inputs.slice(i, i + concurrency);
        const chunkResults = await Promise.all(chunk.map(u => extractPlaceDetails(browser, u)));
        results.push(...chunkResults.filter(r => r.name !== 'N/A'));
    }
    return results;
}

async function findContactDetailsBatch(browser, leads, concurrency = 3) {
    const results = [];
    for (let i = 0; i < leads.length; i += concurrency) {
        const chunk = leads.slice(i, i + concurrency);
        const chunkResults = await Promise.all(chunk.map(async (lead) => {
            let details = { emails: [], facebook: '', instagram: '', linkedin: '' };
            if (lead.website && lead.website !== 'N/A') {
                let targetUrl = lead.website;
                if (!targetUrl.startsWith('http')) targetUrl = 'http://' + targetUrl;
                details = await findContactDetails(browser, targetUrl);
            }
            return {
                ...lead,
                emails: details.emails.join(', ') || 'N/A',
                facebook: details.facebook || 'N/A',
                instagram: details.instagram || 'N/A',
                linkedin: details.linkedin || 'N/A'
            };
        }));
        results.push(...chunkResults);
    }
    return results;
}

module.exports = {
    cleanText,
    findContactDetails,
    findContactDetailsBatch,
    extractPlaceDetails,
    extractPlaceDetailsBatch,
    scrollFeed,
    setupResourceBlocking
};