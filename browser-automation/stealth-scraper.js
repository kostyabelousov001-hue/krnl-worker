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

function isValidSocialLink(url, type) {
    if (!url || typeof url !== 'string') return false;
    const link = url.trim();
    const lLower = link.toLowerCase();

    // Reject share links, widgets, tracking, and ads
    if (lLower.includes('share') || lLower.includes('sharer') || lLower.includes('sharearticle') || 
        lLower.includes('intent/tweet') || lLower.includes('pin/create') || lLower.includes('reklam') || 
        lLower.includes('widget') || lLower.includes('plugins') || lLower.includes('tr.php')) {
        return false;
    }

    if (type === 'facebook') {
        const match = link.match(/facebook\.com\/([a-zA-Z0-9_.-]+)/i);
        if (!match) return false;
        return !['sharer', 'share', 'plugins', 'tr', 'dialog'].includes(match[1].toLowerCase());
    }
    if (type === 'instagram') {
        const match = link.match(/instagram\.com\/([a-zA-Z0-9_.-]+)/i);
        if (!match) return false;
        return !['p', 'explore', 'developer', 'about', 'legal', 'directory'].includes(match[1].toLowerCase());
    }
    if (type === 'linkedin') {
        return lLower.includes('/company/') || lLower.includes('/in/') || lLower.includes('/pub/') || lLower.includes('/school/');
    }
    if (type === 'whatsapp') {
        if (lLower.includes('text=') && !lLower.includes('phone=')) {
            return false; // share link
        }
        // Extract phone number digits
        const match = link.match(/(?:phone=|wa\.me\/|send\?phone=)(\+?[0-9\s\-()]+)/i);
        if (match) {
            const cleanNum = match[1].replace(/\D/g, '');
            return cleanNum.length >= 10 && cleanNum.length <= 15;
        }
        const waMatch = link.match(/wa\.me\/([0-9]+)/i);
        return !!waMatch && waMatch[1].length >= 10;
    }
    if (type === 'telegram') {
        const match = link.match(/(?:t\.me|telegram\.me|telegram\.dog)\/([a-zA-Z0-9_.-]+)/i);
        if (!match) return false;
        return !['share', 'addstickers', 'setlanguage', 'contact', 'about', 'joinchat', 's', 'telegram'].includes(match[1].toLowerCase());
    }
    if (type === 'viber') {
        return lLower.includes('viber.click/') || lLower.includes('chats.viber.com/') || lLower.includes('viber.me/') || (lLower.startsWith('viber://') && lLower.length > 8);
    }
    if (type === 'vk') {
        const match = link.match(/(?:vk\.com|vk\.me)\/([a-zA-Z0-9_.-]+)/i);
        if (!match) return false;
        return !['share.php', 'share', 'widget', 'images', 'css', 'js', 'widget_community.php'].includes(match[1].toLowerCase());
    }

    return true;
}

function extractSocialsFromHtml(html) {
    const data = { facebook: '', instagram: '', linkedin: '', whatsapp: '', telegram: '', viber: '', vk: '' };
    if (!html) return data;
    
    const hrefRegex = /href="([^"]+)"/ig;
    let match;
    const links = [];
    while ((match = hrefRegex.exec(html)) !== null) {
        links.push(match[1]);
    }
    
    for (const link of links) {
        const lLower = link.toLowerCase();
        
        if (lLower.includes('facebook.com') && !data.facebook && isValidSocialLink(link, 'facebook')) {
            const m = link.match(/facebook\.com\/([a-zA-Z0-9_.-]+)/i);
            if (m) data.facebook = `https://facebook.com/${m[1]}`;
        }
        else if (lLower.includes('instagram.com') && !data.instagram && isValidSocialLink(link, 'instagram')) {
            const m = link.match(/instagram\.com\/([a-zA-Z0-9_.-]+)/i);
            if (m) data.instagram = `https://instagram.com/${m[1]}`;
        }
        else if (lLower.includes('linkedin.com') && !data.linkedin && isValidSocialLink(link, 'linkedin')) {
            data.linkedin = link;
        }
        else if ((lLower.includes('wa.me') || lLower.includes('api.whatsapp.com') || lLower.includes('whatsapp.com/send')) && !data.whatsapp && isValidSocialLink(link, 'whatsapp')) {
            const phoneMatch = link.match(/(?:phone=|wa\.me\/|send\?phone=)(\+?[0-9\s\-()]+)/i);
            if (phoneMatch) {
                data.whatsapp = `https://wa.me/${phoneMatch[1].replace(/\D/g, '')}`;
            } else {
                data.whatsapp = link;
            }
        }
        else if ((lLower.includes('t.me') || lLower.includes('telegram.me') || lLower.includes('telegram.dog')) && !data.telegram && isValidSocialLink(link, 'telegram')) {
            const tgMatch = link.match(/(?:t\.me|telegram\.me|telegram\.dog)\/([a-zA-Z0-9_.-]+)/i);
            if (tgMatch) data.telegram = `https://t.me/${tgMatch[1]}`;
        }
        else if ((lLower.includes('viber.click') || lLower.includes('chats.viber.com') || link.startsWith('viber://') || lLower.includes('viber.me')) && !data.viber && isValidSocialLink(link, 'viber')) {
            data.viber = link;
        }
        else if ((lLower.includes('vk.com') || lLower.includes('vk.me')) && !data.vk && isValidSocialLink(link, 'vk')) {
            const vkMatch = link.match(/(?:vk\.com|vk\.me)\/([a-zA-Z0-9_.-]+)/i);
            if (vkMatch) data.vk = `https://vk.com/${vkMatch[1]}`;
        }
    }
    return data;
}

async function extractSocialsFromPage(page) {
    const data = { facebook: '', instagram: '', linkedin: '', whatsapp: '', telegram: '', viber: '', vk: '' };
    try {
        const links = await page.locator('a').evaluateAll(anchors =>
            anchors.map(a => a.href).filter(href => href && href.startsWith('http'))
        ).catch(() => []);
        
        for (const link of links) {
            const lLower = link.toLowerCase();
            if (lLower.includes('facebook.com') && !data.facebook && isValidSocialLink(link, 'facebook')) {
                const m = link.match(/facebook\.com\/([a-zA-Z0-9_.-]+)/i);
                if (m) data.facebook = `https://facebook.com/${m[1]}`;
            }
            else if (lLower.includes('instagram.com') && !data.instagram && isValidSocialLink(link, 'instagram')) {
                const m = link.match(/instagram\.com\/([a-zA-Z0-9_.-]+)/i);
                if (m) data.instagram = `https://instagram.com/${m[1]}`;
            }
            else if (lLower.includes('linkedin.com') && !data.linkedin && isValidSocialLink(link, 'linkedin')) {
                data.linkedin = link;
            }
            else if ((lLower.includes('wa.me') || lLower.includes('api.whatsapp.com') || lLower.includes('whatsapp.com/send')) && !data.whatsapp && isValidSocialLink(link, 'whatsapp')) {
                const phoneMatch = link.match(/(?:phone=|wa\.me\/|send\?phone=)(\+?[0-9\s\-()]+)/i);
                if (phoneMatch) {
                    data.whatsapp = `https://wa.me/${phoneMatch[1].replace(/\D/g, '')}`;
                } else {
                    data.whatsapp = link;
                }
            }
            else if ((lLower.includes('t.me') || lLower.includes('telegram.me') || lLower.includes('telegram.dog')) && !data.telegram && isValidSocialLink(link, 'telegram')) {
                const tgMatch = link.match(/(?:t\.me|telegram\.me|telegram\.dog)\/([a-zA-Z0-9_.-]+)/i);
                if (tgMatch) data.telegram = `https://t.me/${tgMatch[1]}`;
            }
            else if ((lLower.includes('viber.click') || lLower.includes('chats.viber.com') || link.startsWith('viber://') || lLower.includes('viber.me')) && !data.viber && isValidSocialLink(link, 'viber')) {
                data.viber = link;
            }
            else if ((lLower.includes('vk.com') || lLower.includes('vk.me')) && !data.vk && isValidSocialLink(link, 'vk')) {
                const vkMatch = link.match(/(?:vk\.com|vk\.me)\/([a-zA-Z0-9_.-]+)/i);
                if (vkMatch) data.vk = `https://vk.com/${vkMatch[1]}`;
            }
        }
    } catch (e) {}
    return data;
}

async function findContactDetails(browser, url) {
    const data = { emails: [], facebook: '', instagram: '', linkedin: '', whatsapp: '', telegram: '', viber: '', vk: '' };
    if (!url || url === 'N/A') return data;

    // 🔥 HIGH PERFORMANCE RAW HTTP FETCH FIRST (BLAZING FAST)
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
            const html = await res.text();
            
            // Extract emails using Regex
            const matched = extractEmailsFromString(html);
            if (matched.length > 0) data.emails.push(...matched);

            // Extract socials & messengers using HTML link extractor
            const socials = extractSocialsFromHtml(html);
            if (socials.facebook) data.facebook = socials.facebook;
            if (socials.instagram) data.instagram = socials.instagram;
            if (socials.linkedin) data.linkedin = socials.linkedin;
            if (socials.whatsapp) data.whatsapp = socials.whatsapp;
            if (socials.telegram) data.telegram = socials.telegram;
            if (socials.viber) data.viber = socials.viber;
            if (socials.vk) data.vk = socials.vk;

            // If we found emails or messengers, return immediately
            if (data.emails.length > 0 || data.facebook || data.instagram || data.linkedin || data.whatsapp || data.telegram || data.viber || data.vk) {
                data.emails = [...new Set(data.emails)];
                return data;
            }
        }
    } catch (e) {
        // Fall back to Playwright on network failure or timeout
    }

    // 🌐 PLAYWRIGHT BROWSER FALLBACK
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
        data.whatsapp = socials.whatsapp;
        data.telegram = socials.telegram;
        data.viber = socials.viber;
        data.vk = socials.vk;

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
                
                // Grab messengers on contact page too
                const contactSocials = await extractSocialsFromPage(page);
                if (contactSocials.facebook && !data.facebook) data.facebook = contactSocials.facebook;
                if (contactSocials.instagram && !data.instagram) data.instagram = contactSocials.instagram;
                if (contactSocials.linkedin && !data.linkedin) data.linkedin = contactSocials.linkedin;
                if (contactSocials.whatsapp && !data.whatsapp) data.whatsapp = contactSocials.whatsapp;
                if (contactSocials.telegram && !data.telegram) data.telegram = contactSocials.telegram;
                if (contactSocials.viber && !data.viber) data.viber = contactSocials.viber;
                if (contactSocials.vk && !data.vk) data.vk = contactSocials.vk;
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
            const h1s = Array.from(document.querySelectorAll('h1.DUwDvf, h1[class*="DUwDvf"], h1'));
            for (const h1 of h1s) {
                const text = h1.textContent.trim();
                const tLower = text.toLowerCase();
                if (text.length > 1 && 
                    !tLower.includes("reklam") && 
                    !tLower.includes("why this ad") && 
                    !tLower.includes("adchoices") && 
                    !tLower.includes("реклама") && 
                    !tLower.includes("about this ad") &&
                    !tLower.includes("sponsored") &&
                    !tLower.includes("advertisement")) {
                    return text;
                }
            }
            return null;
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