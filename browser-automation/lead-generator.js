const { chromium } = require('playwright');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');
const path = require('path');

// Output CSV path
const csvPath = path.join(__dirname, 'leads.csv');

// Helper to clean text and handle encoding cleanly
function cleanText(text) {
    if (!text) return 'N/A';
    return text.replace(/\s+/g, ' ').trim();
}

// Write leads list to CSV with Excel-friendly format (Semicolon delimited, UTF-8 BOM)
async function saveToCsv(leadsList) {
    const csvWriter = createCsvWriter({
        path: csvPath,
        fieldDelimiter: ';',
        header: [
            { id: 'name', title: 'Business Name' },
            { id: 'rating', title: 'Rating' },
            { id: 'reviews', title: 'Review Count' },
            { id: 'phone', title: 'Phone' },
            { id: 'website', title: 'Website' },
            { id: 'emails', title: 'Emails' },
            { id: 'facebook', title: 'Facebook' },
            { id: 'instagram', title: 'Instagram' },
            { id: 'linkedin', title: 'LinkedIn' }
        ]
    });
    
    // Write records (this overwrites the file from scratch)
    await csvWriter.writeRecords(leadsList);
    
    // Read and rewrite with UTF-8 BOM prefix
    try {
        const fileContent = fs.readFileSync(csvPath, 'utf8');
        fs.writeFileSync(csvPath, '\ufeff' + fileContent, 'utf8');
    } catch (e) {
        console.error("Error writing BOM to CSV:", e.message);
    }
}

// Block images, media, fonts, and optionally stylesheets to speed up loading
async function setupResourceBlocking(page, blockStylesheets = false) {
    await page.route('**/*', (route) => {
        const type = route.request().resourceType();
        const blockTypes = ['image', 'media', 'font'];
        if (blockStylesheets) {
            blockTypes.push('stylesheet');
        }
        if (blockTypes.includes(type)) {
            route.abort();
        } else {
            route.continue();
        }
    });
}

// Extract contact details from website (lightweight: blocks styles, images, fonts, media)
async function findContactDetails(browser, url) {
    const data = { emails: [], facebook: '', instagram: '', linkedin: '' };
    if (!url || url === 'N/A') return data;

    const page = await browser.newPage();
    try {
        // Block stylesheets on company websites for massive speed boost!
        await setupResourceBlocking(page, true);
        
        // Timeout 12 seconds, load page
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
        const content = await page.content().catch(() => '');
        
        // Match emails using regex
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const matchedEmails = content.match(emailRegex);
        if (matchedEmails) {
            data.emails = [...new Set(matchedEmails)].filter(email => {
                const ext = email.split('.').pop().toLowerCase();
                return !['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext);
            });
        }

        // Match social links
        const links = await page.locator('a').evaluateAll(anchors => 
            anchors.map(a => a.href).filter(href => href && href.startsWith('http'))
        ).catch(() => []);

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
        // Ignore site loading errors
    } finally {
        await page.close().catch(() => {});
    }
    return data;
}

// Extract place details from Google Maps place URL directly
async function extractPlaceDetails(browser, url) {
    const data = { name: 'N/A', rating: 'N/A', reviews: '0', phone: 'N/A', website: 'N/A' };
    const page = await browser.newPage();
    try {
        // Keep stylesheets on Google Maps so JS doesn't break, but block images/media/fonts
        await setupResourceBlocking(page, false);
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        // Wait for the name selector to load and become visible (up to 8 seconds)
        // This ensures the details panel has finished rendering in Google Maps' React app.
        const nameEl = page.locator('h1.DUwDvf').first();
        await nameEl.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
        
        const name = await nameEl.textContent({ timeout: 1000 }).catch(() => 'N/A');
        if (name !== 'N/A') {
            const rating = await page.locator('div.F7nice span[aria-hidden="true"]').first().textContent({ timeout: 1000 }).catch(() => 'N/A');
            const reviewsStr = await page.locator('div.F7nice span[aria-label*="отзыв"], div.F7nice span[aria-label*="review"]').first().textContent({ timeout: 1000 }).catch(() => '0');
            const reviews = reviewsStr.replace(/[^0-9]/g, '');
            const phone = await page.locator('button[data-item-id^="phone:tel:"] div.fontBodyMedium').first().textContent({ timeout: 1000 }).catch(() => 'N/A');
            const website = await page.locator('a[data-item-id="authority"] div.fontBodyMedium').first().textContent({ timeout: 1000 }).catch(() => 'N/A');

            data.name = cleanText(name);
            data.rating = cleanText(rating);
            data.reviews = cleanText(reviews);
            data.phone = cleanText(phone);
            data.website = cleanText(website);
        }
    } catch (err) {
        // Ignore loading errors
    } finally {
        await page.close().catch(() => {});
    }
    return data;
}

// In-page smooth scroll helper for Google Maps results feed
async function scrollFeed(page) {
    await page.evaluate(async () => {
        const feed = document.querySelector('div[role="feed"]');
        if (feed) {
            for (let j = 0; j < 8; j++) {
                feed.scrollBy(0, 500);
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            // Snap to the current bottom
            feed.scrollTop = feed.scrollHeight;
        }
    }).catch(() => {});
}

async function scrapeGoogleMaps(searchQuery, maxResults = 100) {
    console.log(`[Scraper] Starting optimized parallel run for: "${searchQuery}" (Limit: ${maxResults})`);
    
    // Clear CSV at the start
    await saveToCsv([]);

    const browser = await chromium.launch({ 
        headless: false,
        args: ['--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    
    // Enable resource blocking on search page
    await setupResourceBlocking(page, false);

    const encodedQuery = encodeURIComponent(searchQuery);
    await page.goto(`https://www.google.com/maps/search/${encodedQuery}`);

    try {
        const consentButton = page.locator('button:has-text("Reject all"), button:has-text("Accept all"), button:has-text("Принять всё"), button:has-text("Отклонить всё")');
        if (await consentButton.count() > 0) {
            console.log("[Scraper] Handling consent popup...");
            await consentButton.first().click({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(1000);
        }
    } catch (e) {}

    const placeUrls = new Set();
    
    try {
        const feedSelector = 'div[role="feed"]';
        await page.waitForSelector(feedSelector, { timeout: 15000 });
        console.log("[Scraper] Discovered results feed. Collecting item URLs...");

        const startTime = Date.now();
        let consecutiveNoNewItems = 0;
        
        // --- PHASE 1: COLLECT ALL PLACE URLS (EXTREMELY FAST) ---
        while (placeUrls.size < maxResults) {
            const items = await page.locator('a[href*="/maps/place/"]').all();
            const beforeCount = placeUrls.size;
            
            for (const item of items) {
                const href = await item.getAttribute('href').catch(() => null);
                if (href) {
                    placeUrls.add(href);
                }
            }

            console.log(`[Maps Phase] Discovered: ${placeUrls.size}/${maxResults} place links...`);
            
            if (placeUrls.size >= maxResults) break;

            // Scroll down feed container smoothly
            await scrollFeed(page);

            // Force scroll down by bringing last item into view
            if (items.length > 0) {
                const lastItem = items[items.length - 1];
                await lastItem.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
            }

            await page.waitForTimeout(2500); // Wait for new search items to render
            
            const endText = await page.locator('span:has-text("Конец списка"), span:has-text("You\'ve reached the end of the list")').count();
            if (endText > 0) {
                console.log("[Scraper] Reached end of Google Maps feed.");
                break;
            }

            if (placeUrls.size === beforeCount) {
                consecutiveNoNewItems++;
                if (consecutiveNoNewItems > 8) {
                    console.log("[Scraper] No new links discovered. Stopping discovery.");
                    break;
                }
            } else {
                consecutiveNoNewItems = 0;
            }
        }

        // Close search page as we don't need it anymore
        await page.close().catch(() => {});

        const urlsArray = Array.from(placeUrls).slice(0, maxResults);
        console.log(`\n[Scraper] Discovered ${urlsArray.length} place links in total.`);
        console.log(`--- PHASE 2: EXTRACT PLACE DETAILS (PARALLEL BATCHES OF 10 TABS) ---`);

        const leads = [];
        const startTime2 = Date.now();
        let extractedCount = 0;
        const batchSize = 10;

        for (let i = 0; i < urlsArray.length; i += batchSize) {
            const batch = urlsArray.slice(i, i + batchSize);
            console.log(`\n[Maps Phase] Extracting Details Batch #${Math.floor(i / batchSize) + 1} (${batch.length} place pages in parallel)...`);

            const batchPromises = batch.map(async (url) => {
                const details = await extractPlaceDetails(browser, url);
                
                const cleanLead = {
                    name: details.name,
                    rating: details.rating,
                    reviews: details.reviews,
                    phone: details.phone,
                    website: details.website,
                    emails: 'N/A',
                    facebook: 'N/A',
                    instagram: 'N/A',
                    linkedin: 'N/A'
                };

                extractedCount++;

                // Live console dashboard stats
                const elapsed = (Date.now() - startTime2) / 1000;
                const speedSec = (extractedCount / elapsed).toFixed(2);
                const speedMin = (speedSec * 60).toFixed(1);
                const remaining = urlsArray.length - extractedCount;
                console.log(`[Dashboard] [Maps Phase] Extracted: ${extractedCount}/${urlsArray.length} | Remaining: ${remaining} | Speed: ${speedSec} leads/sec (${speedMin} leads/min) | Name: "${cleanLead.name}"`);

                return cleanLead;
            });

            const batchResults = await Promise.all(batchPromises);
            leads.push(...batchResults);

            // Write intermediate results to CSV in real-time
            await saveToCsv(leads);
        }

        console.log(`\n[Scraper] Details extraction complete. Collected ${leads.length} leads.`);
        console.log(`--- PHASE 3: WEBSITE CONTACT CRAWLING (PARALLEL BATCHES OF 10 TABS, STYLESHEETS BLOCKED) ---`);

        const finalLeads = [];
        const startTime3 = Date.now();
        let crawledCount = 0;

        for (let i = 0; i < leads.length; i += batchSize) {
            const batch = leads.slice(i, i + batchSize);
            console.log(`\n[Web Phase] Launching website batch #${Math.floor(i / batchSize) + 1} (${batch.length} websites in parallel)...`);

            const batchPromises = batch.map(async (lead) => {
                let details = { emails: [], facebook: '', instagram: '', linkedin: '' };
                if (lead.website && lead.website !== 'N/A') {
                    let targetUrl = lead.website;
                    if (!targetUrl.startsWith('http')) {
                        targetUrl = 'http://' + targetUrl;
                    }
                    try {
                        details = await findContactDetails(browser, targetUrl);
                    } catch (err) {
                        // ignore error
                    }
                }

                const resultLead = {
                    ...lead,
                    emails: details.emails.join(', ') || 'N/A',
                    facebook: details.facebook || 'N/A',
                    instagram: details.instagram || 'N/A',
                    linkedin: details.linkedin || 'N/A'
                };

                crawledCount++;

                // Live console dashboard stats for Web Phase
                const elapsed3 = (Date.now() - startTime3) / 1000;
                const speedSec3 = (crawledCount / elapsed3).toFixed(2);
                const speedMin3 = (speedSec3 * 60).toFixed(1);
                const remaining3 = leads.length - crawledCount;
                console.log(`[Dashboard] [Web Phase] Processed: ${crawledCount}/${leads.length} | Remaining: ${remaining3} | Speed: ${speedSec3} leads/sec (${speedMin3} leads/min) | Website: ${lead.website}`);

                return resultLead;
            });

            const batchResults = await Promise.all(batchPromises);
            finalLeads.push(...batchResults);

            // Write intermediate results to CSV (combining crawled leads + remaining uncrawled leads)
            const currentCombinedList = [
                ...finalLeads,
                ...leads.slice(finalLeads.length)
            ];
            await saveToCsv(currentCombinedList);
        }

        console.log(`\n[Scraper] SUCCESS: Completed run. Saved ${finalLeads.length} leads to ${csvPath}`);

    } catch (err) {
        console.error("Global Scraper Error:", err.message);
    } finally {
        await browser.close().catch(() => {});
    }
}

// Run the scraper for Dubai real estate agents, up to 100 leads
scrapeGoogleMaps('real estate Dubai', 100);
