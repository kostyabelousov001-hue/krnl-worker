const { chromium } = require('playwright');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

async function findContactDetails(browser, url) {
    const data = { emails: [], facebook: '', instagram: '', linkedin: '' };
    if (!url || url === 'N/A') return data;

    const page = await browser.newPage();
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
        const content = await page.content();
        
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const matchedEmails = content.match(emailRegex);
        if (matchedEmails) {
            data.emails = [...new Set(matchedEmails)].filter(email => {
                const ext = email.split('.').pop().toLowerCase();
                return !['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext);
            });
        }

        const links = await page.locator('a').evaluateAll(anchors => 
            anchors.map(a => a.href).filter(href => href.startsWith('http'))
        );

        for (const link of links) {
            if (link.includes('facebook.com') && !data.facebook) {
                data.facebook = link;
            } else if (link.includes('instagram.com') && !data.instagram) {
                data.instagram = link;
            } else if (link.includes('linkedin.com') && !data.linkedin) {
                data.linkedin = link;
            }
        }
    } catch (err) {
        // Skip website load errors silently
    } finally {
        await page.close();
    }
    return data;
}

async function runScraper(searchQuery, maxResults, outputPath) {
    console.log(`[Scraper] Starting for query: "${searchQuery}"`);
    
    // Launch headless for background bot runs
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    const encodedQuery = encodeURIComponent(searchQuery);
    await page.goto(`https://www.google.com/maps/search/${encodedQuery}`);

    try {
        const consentButton = page.locator('button:has-text("Reject all"), button:has-text("Accept all"), button:has-text("Принять всё"), button:has-text("Отклонить всё")');
        if (await consentButton.count() > 0) {
            await consentButton.first().click();
            await page.waitForTimeout(1000);
        }
    } catch (e) {}

    const leads = [];
    
    try {
        const feedSelector = 'div[role="feed"]';
        await page.waitForSelector(feedSelector, { timeout: 10000 });

        while (leads.length < maxResults) {
            const items = await page.locator('a[href*="/maps/place/"]').all();
            if (items.length === 0) break;

            for (let i = 0; i < items.length && leads.length < maxResults; i++) {
                try {
                    const item = items[i];
                    await item.click();
                    await page.waitForTimeout(1000);

                    const name = await page.locator('h1.DUwDvf').first().textContent().catch(() => 'N/A');
                    if (leads.some(l => l.name === name)) continue;

                    const rating = await page.locator('div.F7nice span[aria-hidden="true"]').first().textContent().catch(() => 'N/A');
                    const reviewsStr = await page.locator('div.F7nice span[aria-label*="отзыв"], div.F7nice span[aria-label*="review"]').first().textContent().catch(() => '0');
                    const reviews = reviewsStr.replace(/[^0-9]/g, '');
                    const phone = await page.locator('button[data-item-id^="phone:tel:"] div.fontBodyMedium').first().textContent().catch(() => 'N/A');
                    const website = await page.locator('a[data-item-id="authority"] div.fontBodyMedium').first().textContent().catch(() => 'N/A');

                    leads.push({
                        name: name.trim(),
                        rating: rating.trim(),
                        reviews: reviews.trim(),
                        phone: phone.trim(),
                        website: website.trim()
                    });
                } catch (e) {}
            }

            const scrollPanel = page.locator('div[role="feed"]');
            await scrollPanel.evaluate(node => node.scrollBy(0, 800));
            await page.waitForTimeout(1500);
            
            const endText = await page.locator('span:has-text("Конец списка"), span:has-text("You\'ve reached the end of the list")').count();
            if (endText > 0) break;
        }

        const finalLeads = [];
        for (const lead of leads) {
            let details = { emails: [], facebook: '', instagram: '', linkedin: '' };
            if (lead.website !== 'N/A') {
                let targetUrl = lead.website;
                if (!targetUrl.startsWith('http')) {
                    targetUrl = 'http://' + targetUrl;
                }
                details = await findContactDetails(browser, targetUrl);
            }
            
            finalLeads.push({
                ...lead,
                emails: details.emails.join(', ') || 'N/A',
                facebook: details.facebook || 'N/A',
                instagram: details.instagram || 'N/A',
                linkedin: details.linkedin || 'N/A'
            });
        }

        const csvWriter = createCsvWriter({
            path: outputPath,
            header: [
                { id: 'name', title: 'Business Name' },
                { id: 'rating', title: 'Rating' },
                { id: 'reviews', title: 'Reviews' },
                { id: 'phone', title: 'Phone' },
                { id: 'website', title: 'Website' },
                { id: 'emails', title: 'Emails' },
                { id: 'facebook', title: 'Facebook' },
                { id: 'instagram', title: 'Instagram' },
                { id: 'linkedin', title: 'LinkedIn' }
            ]
        });

        await csvWriter.writeRecords(finalLeads);
        console.log(`[Scraper] Scraped ${finalLeads.length} leads and wrote to ${outputPath}`);
        return finalLeads.length;

    } catch (err) {
        console.error("[Scraper] Error:", err.message);
        throw err;
    } finally {
        await browser.close();
    }
}

module.exports = { runScraper };
