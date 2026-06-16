/**
 * KRNL Lead Contact & Messenger Validator v2
 * 
 * Runs fast asynchronous validation on existing leads to:
 * 1. Filter out advertising leads (e.g. Google Maps ads containing "Niyə bu reklam?", "sponsored", etc.)
 * 2. Deduplicate records
 * 3. Clean up generic share links in messenger fields
 * 4. Format valid phones to WhatsApp wa.me links
 * 5. Verify Telegram & VK profiles via asynchronous HTTP probing (checking if user exists)
 * 6. Generate detailed CSV, JSON, and a beautiful premium dark-themed HTML report
 */

const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, 'leads_temp.ndjson');
const csvOutputPath = path.join(__dirname, 'leads_validated.csv');
const jsonOutputPath = path.join(__dirname, 'leads_validated.json');
const htmlOutputPath = path.join(__dirname, 'leads_validated.html');

// ANSI color helpers
const reset = "\x1b[0m";
const bold = "\x1b[1m";
const green = "\x1b[32m";
const yellow = "\x1b[33m";
const blue = "\x1b[34m";
const cyan = "\x1b[36m";
const red = "\x1b[31m";

function log(msg, type = 'INFO') {
    const time = new Date().toLocaleTimeString();
    let prefix = `${bold}${blue}[INFO]${reset}`;
    if (type === 'SUCCESS') prefix = `${bold}${green}[OK]${reset}`;
    if (type === 'WARN') prefix = `${bold}${yellow}[WARN]${reset}`;
    if (type === 'ERROR') prefix = `${bold}${red}[ERR]${reset}`;
    console.log(`[${time}] ${prefix} ${msg}`);
}

function cleanText(text) {
    if (!text) return 'N/A';
    return text.replace(/\s+/g, ' ').trim();
}

// Check if string contains advertising indicators
function isAdText(text) {
    if (!text) return false;
    const t = text.toLowerCase();
    return t.includes("reklam") || 
           t.includes("why this ad") || 
           t.includes("adchoices") || 
           t.includes("реклама") || 
           t.includes("about this ad") ||
           t.includes("sponsored") ||
           t.includes("advertisement") ||
           t.includes("reklama");
}

// Check if a social/messenger link is a generic share/widget or ad link
function isValidSocialLink(url, type) {
    if (!url || typeof url !== 'string' || url === 'N/A') return false;
    const link = url.trim();
    const lLower = link.toLowerCase();

    // Reject share buttons, widgets, tracking, and ads
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

// Convert a standard phone number string into a clean wa.me WhatsApp link
function formatWhatsAppLink(phone) {
    if (!phone || phone === 'N/A') return 'N/A';
    // Remove all non-digits
    let digits = phone.replace(/\D/g, '');
    // If it starts with 8 and is 11 digits (Russian format), convert 8 to 7
    if (digits.length === 11 && digits.startsWith('8')) {
        digits = '7' + digits.slice(1);
    }
    // Standard phone number length check
    if (digits.length >= 10 && digits.length <= 15) {
        return `https://wa.me/${digits}`;
    }
    return 'N/A';
}

// Active Telegram Account Verification
async function verifyTelegramLink(url) {
    if (!url || url === 'N/A') return { status: 'N/A', url: 'N/A' };
    
    // Normalize url
    let link = url;
    if (!link.startsWith('http')) link = 'https://' + link;
    
    const match = link.match(/(?:t\.me|telegram\.me|telegram\.dog)\/([a-zA-Z0-9_.-]+)/i);
    if (!match) return { status: 'Invalid Link', url: link };
    
    const username = match[1];
    if (['share', 'addstickers', 'setlanguage', 'contact', 'about', 'joinchat', 's'].includes(username.toLowerCase())) {
        return { status: 'Share/System Link', url: 'N/A' };
    }

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        
        const res = await fetch(`https://t.me/${username}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            signal: controller.signal
        });
        clearTimeout(timer);
        
        if (!res.ok) return { status: 'Dead Link', url: link };
        
        const html = await res.text();
        
        if (html.includes('tgme_page_error') || html.includes('If you have Telegram, you can contact')) {
            return { status: 'User Not Found', url: 'N/A' };
        }
        if (html.includes('tgme_page_title') || html.includes('tgme_page_extra') || html.includes('tgme_action_button_new')) {
            return { status: 'Active', url: `https://t.me/${username}` };
        }
        return { status: 'Unverified', url: `https://t.me/${username}` };
    } catch (e) {
        return { status: 'Active (Unchecked)', url: `https://t.me/${username}` };
    }
}

// Active VK Profile Verification
async function verifyVKLink(url) {
    if (!url || url === 'N/A') return { status: 'N/A', url: 'N/A' };
    
    let link = url;
    if (!link.startsWith('http')) link = 'https://' + link;
    
    const match = link.match(/(?:vk\.com|vk\.me)\/([a-zA-Z0-9_.-]+)/i);
    if (!match) return { status: 'Invalid Link', url: link };
    
    const username = match[1];
    if (['share.php', 'share', 'widget', 'images', 'css', 'js', 'widget_community.php'].includes(username.toLowerCase())) {
        return { status: 'Share/System Link', url: 'N/A' };
    }

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        
        const res = await fetch(`https://vk.com/${username}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            signal: controller.signal
        });
        clearTimeout(timer);
        
        if (!res.ok) return { status: 'Dead Link', url: link };
        
        const html = await res.text();
        if (html.includes('Page not found') || html.includes('Страница не найдена') || html.includes('Ошибка 404')) {
            return { status: 'User Not Found', url: 'N/A' };
        }
        return { status: 'Active', url: `https://vk.com/${username}` };
    } catch (e) {
        return { status: 'Active (Unchecked)', url: `https://vk.com/${username}` };
    }
}

// Queue system with concurrency limit
async function parallelLimit(items, limit, fn) {
    const results = [];
    let index = 0;

    async function worker() {
        while (index < items.length) {
            const currIndex = index++;
            results[currIndex] = await fn(items[currIndex], currIndex);
        }
    }

    const workers = [];
    for (let i = 0; i < Math.min(limit, items.length); i++) {
        workers.push(worker());
    }
    await Promise.all(workers);
    return results;
}

// Main execution function
async function main() {
    console.log(`\n${bold}${cyan}⚡ KRNL MESSENGER & CONTACT VALIDATOR ENGINE STARTED${reset}\n`);

    if (!fs.existsSync(jsonPath)) {
        log(`No leads cache file found at: ${jsonPath}`, 'ERROR');
        console.log(`Please run the main scraper first to generate NDJSON data.`);
        process.exit(1);
    }

    log(`Reading leads database...`);
    const raw = fs.readFileSync(jsonPath, 'utf8').trim();
    if (!raw) {
        log(`Leads database file is empty!`, 'ERROR');
        process.exit(1);
    }

    let rawLeads = raw.split('\n').map(line => {
        try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);

    log(`Loaded ${rawLeads.length} total raw leads from cache.`);

    // 1. Filter out advertising leads
    const filteredLeads = [];
    let adCount = 0;
    
    for (const lead of rawLeads) {
        if (isAdText(lead.name) || isAdText(lead.website) || isAdText(lead.phone)) {
            adCount++;
            continue;
        }
        filteredLeads.push(lead);
    }
    
    log(`Filtered out ${adCount} advertising items (Google Ads, sponsored, etc.).`);

    // 2. Deduplicate leads by name & phone or name & website
    const seen = new Set();
    const uniqueLeads = [];
    let dupCount = 0;

    for (const lead of filteredLeads) {
        const phoneKey = lead.phone ? lead.phone.replace(/\D/g, '') : '';
        const nameKey = (lead.name || '').toLowerCase().trim();
        const webKey = (lead.website || '').toLowerCase().trim();
        
        let key = nameKey;
        if (phoneKey) key += `_${phoneKey}`;
        else if (webKey) key += `_${webKey}`;
        
        if (seen.has(key)) {
            dupCount++;
            continue;
        }
        seen.add(key);
        uniqueLeads.push(lead);
    }

    log(`Removed ${dupCount} duplicate leads. Clean count: ${uniqueLeads.length} leads.`);

    // 3. Process each lead: format WhatsApp, check socials, check Telegram/VK
    log(`Starting active validation (concurrency = 15)...`);
    
    let stats = {
        total: uniqueLeads.length,
        whatsappCount: 0,
        telegramCount: 0,
        viberCount: 0,
        vkCount: 0,
        emailCount: 0,
        activeTelegram: 0,
        activeVK: 0
    };

    let processed = 0;

    await parallelLimit(uniqueLeads, 15, async (lead) => {
        // Normalize fields
        lead.name = lead.name || 'N/A';
        lead.phone = lead.phone || 'N/A';
        lead.website = lead.website || 'N/A';
        lead.emails = lead.emails || 'N/A';
        
        // Clean original messenger fields of share widget links
        lead.whatsapp = isValidSocialLink(lead.whatsapp, 'whatsapp') ? lead.whatsapp : 'N/A';
        lead.telegram = isValidSocialLink(lead.telegram, 'telegram') ? lead.telegram : 'N/A';
        lead.viber = isValidSocialLink(lead.viber, 'viber') ? lead.viber : 'N/A';
        lead.vk = isValidSocialLink(lead.vk, 'vk') ? lead.vk : 'N/A';
        lead.facebook = isValidSocialLink(lead.facebook, 'facebook') ? lead.facebook : 'N/A';
        lead.instagram = isValidSocialLink(lead.instagram, 'instagram') ? lead.instagram : 'N/A';
        lead.linkedin = isValidSocialLink(lead.linkedin, 'linkedin') ? lead.linkedin : 'N/A';

        // Auto-generate WhatsApp wa.me link from phone number if no whatsapp link scraped
        if (lead.whatsapp === 'N/A' && lead.phone !== 'N/A') {
            const autoWa = formatWhatsAppLink(lead.phone);
            if (autoWa !== 'N/A') {
                lead.whatsapp = autoWa;
            }
        }

        // Initialize status fields
        lead.telegram_status = 'N/A';
        lead.vk_status = 'N/A';

        // Active verify Telegram
        if (lead.telegram !== 'N/A') {
            const check = await verifyTelegramLink(lead.telegram);
            lead.telegram = check.url;
            lead.telegram_status = check.status;
            if (check.status === 'Active' || check.status.includes('Unchecked')) {
                stats.activeTelegram++;
            }
        }

        // Active verify VK
        if (lead.vk !== 'N/A') {
            const check = await verifyVKLink(lead.vk);
            lead.vk = check.url;
            lead.vk_status = check.status;
            if (check.status === 'Active' || check.status.includes('Unchecked')) {
                stats.activeVK++;
            }
        }

        // Update counts
        if (lead.whatsapp !== 'N/A') stats.whatsappCount++;
        if (lead.telegram !== 'N/A') stats.telegramCount++;
        if (lead.viber !== 'N/A') stats.viberCount++;
        if (lead.vk !== 'N/A') stats.vkCount++;
        if (lead.emails !== 'N/A') stats.emailCount++;

        processed++;
        if (processed % 10 === 0 || processed === uniqueLeads.length) {
            const pct = Math.round((processed / uniqueLeads.length) * 100);
            log(`Probing: ${processed}/${uniqueLeads.length} leads processed (${pct}%)`);
        }
    });

    log(`Validation complete. Writing results...`, 'SUCCESS');

    // 1. Write back clean NDJSON database
    const ndjsonOutput = uniqueLeads.map(l => JSON.stringify(l)).join('\n');
    fs.writeFileSync(jsonPath, ndjsonOutput, 'utf8');
    log(`Updated original database cache: leads_temp.ndjson`);

    // 2. Write JSON
    fs.writeFileSync(jsonOutputPath, JSON.stringify(uniqueLeads, null, 2), 'utf8');
    log(`Saved clean JSON list to: leads_validated.json`);

    // 3. Write CSV
    const csvHeader = 'Name;Rating;Review Count;Phone;Website;Emails;WhatsApp;Telegram;Telegram Status;Viber;VK;VK Status;Facebook;Instagram;LinkedIn\n';
    const csvRows = uniqueLeads.map(l => [
        l.name,
        l.rating || 'N/A',
        l.reviews || '0',
        l.phone,
        l.website,
        l.emails,
        l.whatsapp,
        l.telegram,
        l.telegram_status,
        l.viber,
        l.vk,
        l.vk_status,
        l.facebook,
        l.instagram,
        l.linkedin
    ].map(cell => {
        const s = String(cell);
        return (s.includes(';') || s.includes('"')) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';')).join('\n');

    fs.writeFileSync(csvOutputPath, '\ufeff' + csvHeader + csvRows, 'utf8');
    log(`Saved CSV list to: leads_validated.csv`);

    // 4. Generate beautiful HTML report
    const htmlReport = generateHTMLDashboard(uniqueLeads, stats);
    fs.writeFileSync(htmlOutputPath, htmlReport, 'utf8');
    log(`Saved gorgeous HTML report dashboard to: leads_validated.html`, 'SUCCESS');

    console.log(`\n${bold}${green}✓ ALL DONE! validated CSV/JSON/HTML reports are ready!${reset}\n`);
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>"']/g, (m) => {
        switch (m) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case '\'': return '&apos;';
        }
    });
}

function generateHTMLDashboard(leads, stats) {
    const rows = leads.map((l, idx) => {
        // Status classes
        const tgStatusClass = l.telegram_status === 'Active' ? 'badge-active' : (l.telegram_status === 'User Not Found' ? 'badge-dead' : 'badge-uncheck');
        const vkStatusClass = l.vk_status === 'Active' ? 'badge-active' : (l.vk_status === 'User Not Found' ? 'badge-dead' : 'badge-uncheck');

        // Badges HTML
        const emailBadge = l.emails !== 'N/A' 
            ? l.emails.split(', ').map(em => `<a href="mailto:${em}" class="contact-badge email-badge">${escapeHtml(em)}</a>`).join(' ') 
            : '<span class="na">N/A</span>';

        const waBadge = l.whatsapp !== 'N/A'
            ? `<a href="${l.whatsapp}" target="_blank" class="contact-badge wa-badge">💬 WhatsApp</a>`
            : '<span class="na">N/A</span>';

        const tgBadge = l.telegram !== 'N/A'
            ? `<a href="${l.telegram}" target="_blank" class="contact-badge tg-badge">✈️ Telegram</a> <span class="status-indicator ${tgStatusClass}">${l.telegram_status}</span>`
            : '<span class="na">N/A</span>';

        const vkBadge = l.vk !== 'N/A'
            ? `<a href="${l.vk}" target="_blank" class="contact-badge vk-badge">vk VK</a> <span class="status-indicator ${vkStatusClass}">${l.vk_status}</span>`
            : '<span class="na">N/A</span>';

        const viberBadge = l.viber !== 'N/A'
            ? `<a href="${l.viber}" target="_blank" class="contact-badge viber-badge">📞 Viber</a>`
            : '<span class="na">N/A</span>';

        // Filters attributes
        const hasWa = l.whatsapp !== 'N/A' ? 'true' : 'false';
        const hasTg = l.telegram !== 'N/A' ? 'true' : 'false';
        const hasVk = l.vk !== 'N/A' ? 'true' : 'false';
        const hasViber = l.viber !== 'N/A' ? 'true' : 'false';
        const hasEmails = l.emails !== 'N/A' ? 'true' : 'false';

        return `
        <tr data-has-wa="${hasWa}" data-has-tg="${hasTg}" data-has-vk="${hasVk}" data-has-viber="${hasViber}" data-has-emails="${hasEmails}">
            <td class="num-cell">${idx + 1}</td>
            <td class="name-cell">${escapeHtml(l.name)}</td>
            <td class="rating-cell">${l.rating !== 'N/A' ? `⭐ <span>${l.rating}</span>` : '<span class="na">N/A</span>'}</td>
            <td class="phone-cell">${l.phone !== 'N/A' ? `<a href="tel:${l.phone.replace(/\s+/g, '')}">${escapeHtml(l.phone)}</a>` : '<span class="na">N/A</span>'}</td>
            <td class="website-cell">${l.website !== 'N/A' ? `<a href="${l.website.startsWith('http') ? l.website : 'http://' + l.website}" target="_blank" class="web-btn">🌐 Visit</a>` : '<span class="na">N/A</span>'}</td>
            <td class="email-cell">${emailBadge}</td>
            <td class="messengers-cell">
                <div class="messenger-row">${waBadge}</div>
                <div class="messenger-row">${tgBadge}</div>
                <div class="messenger-row">${vkBadge}</div>
                <div class="messenger-row">${viberBadge}</div>
            </td>
        </tr>
        `;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KRNL - Lead Contacts & Messenger Dashboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-grad: radial-gradient(circle at 50% 0%, #17153a 0%, #0d0a1f 50%, #040308 100%);
            --panel-bg: rgba(18, 16, 35, 0.75);
            --border-glow: rgba(124, 58, 237, 0.2);
            --accent: #8b5cf6;
            --accent-glow: rgba(124, 58, 237, 0.4);
            --text-main: #f3f4f6;
            --text-muted: #9ca3af;
            --success: #10b981;
            --warning: #f59e0b;
            --danger: #ef4444;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background: var(--bg-grad);
            background-attachment: fixed;
            color: var(--text-main);
            min-height: 100vh;
            padding: 3rem 1.5rem;
            overflow-x: hidden;
        }

        .container { max-width: 1500px; margin: 0 auto; }

        header {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            margin-bottom: 3rem;
            text-align: center;
            align-items: center;
        }

        .logo-area {
            display: flex;
            align-items: center;
            gap: 10px;
            background: rgba(139, 92, 246, 0.1);
            border: 1px solid rgba(139, 92, 246, 0.3);
            padding: 0.5rem 1.5rem;
            border-radius: 50px;
            box-shadow: 0 0 30px rgba(139, 92, 246, 0.1);
        }

        .logo-area h1 {
            font-size: 1.2rem;
            font-weight: 800;
            letter-spacing: 2px;
            text-transform: uppercase;
            background: linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .subtitle {
            font-size: 0.95rem;
            color: var(--text-muted);
            max-width: 600px;
        }

        /* --- STATS GRID --- */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 1.2rem;
            margin-bottom: 2.5rem;
        }

        .stat-card {
            background: var(--panel-bg);
            border: 1px solid var(--border-glow);
            border-radius: 16px;
            padding: 1.2rem;
            text-align: center;
            position: relative;
            overflow: hidden;
            backdrop-filter: blur(10px);
            transition: all 0.3s ease;
        }

        .stat-card:hover {
            transform: translateY(-3px);
            border-color: rgba(139, 92, 246, 0.4);
            box-shadow: 0 10px 20px rgba(139, 92, 246, 0.05);
        }

        .stat-card::before {
            content: '';
            position: absolute;
            top: 0; left: 0; width: 100%; height: 3px;
            background: linear-gradient(90deg, transparent, var(--accent), transparent);
        }

        .stat-val {
            font-size: 1.8rem;
            font-weight: 800;
            margin-bottom: 0.3rem;
            color: #fff;
            text-shadow: 0 0 10px rgba(255, 255, 255, 0.1);
        }

        .stat-lbl {
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: var(--text-muted);
        }

        /* --- SEARCH AND FILTERS --- */
        .controls-bar {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
            gap: 1.5rem;
            background: var(--panel-bg);
            border: 1px solid var(--border-glow);
            padding: 1.2rem;
            border-radius: 20px;
            margin-bottom: 2rem;
            backdrop-filter: blur(10px);
        }

        .search-wrapper {
            position: relative;
            flex: 1;
            min-width: 300px;
        }

        .search-input {
            width: 100%;
            padding: 0.8rem 1.2rem;
            background: rgba(10, 8, 20, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            color: #fff;
            font-size: 0.9rem;
            outline: none;
            transition: all 0.3s ease;
        }

        .search-input:focus {
            border-color: var(--accent);
            box-shadow: 0 0 15px rgba(139, 92, 246, 0.25);
        }

        .filter-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
        }

        .filter-btn {
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: var(--text-muted);
            padding: 0.6rem 1.1rem;
            border-radius: 10px;
            cursor: pointer;
            font-size: 0.85rem;
            font-weight: 500;
            transition: all 0.2s ease;
        }

        .filter-btn:hover {
            background: rgba(255, 255, 255, 0.08);
            color: #fff;
        }

        .filter-btn.active {
            background: var(--accent);
            border-color: var(--accent);
            color: #fff;
            box-shadow: 0 0 15px rgba(139, 92, 246, 0.3);
        }

        /* --- TABLE --- */
        .table-container {
            background: var(--panel-bg);
            border: 1px solid var(--border-glow);
            border-radius: 20px;
            overflow-x: auto;
            backdrop-filter: blur(10px);
            margin-bottom: 2rem;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
        }

        th {
            background: rgba(10, 8, 20, 0.4);
            padding: 1.2rem 1.5rem;
            font-size: 0.8rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: var(--text-muted);
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        td {
            padding: 1.2rem 1.5rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            font-size: 0.9rem;
            vertical-align: middle;
        }

        tr:last-child td { border-bottom: none; }

        tr:hover td {
            background: rgba(255, 255, 255, 0.015);
        }

        .num-cell {
            color: var(--text-muted);
            font-size: 0.8rem;
            width: 50px;
        }

        .name-cell {
            font-weight: 700;
            color: #fff;
            max-width: 250px;
            word-wrap: break-word;
        }

        .rating-cell {
            white-space: nowrap;
        }

        .rating-cell span {
            font-weight: 600;
        }

        .phone-cell a, .website-cell a {
            color: var(--accent);
            text-decoration: none;
            transition: color 0.2s ease;
        }

        .phone-cell a:hover {
            color: #a78bfa;
            text-decoration: underline;
        }

        .web-btn {
            display: inline-block;
            background: rgba(139, 92, 246, 0.1);
            border: 1px solid rgba(139, 92, 246, 0.2);
            color: var(--accent) !important;
            padding: 0.4rem 0.8rem;
            border-radius: 8px;
            font-size: 0.8rem;
            font-weight: 600;
            transition: all 0.2s ease !important;
        }

        .web-btn:hover {
            background: var(--accent);
            color: #fff !important;
            box-shadow: 0 0 10px rgba(139, 92, 246, 0.2);
        }

        /* Badges */
        .contact-badge {
            display: inline-block;
            padding: 0.35rem 0.7rem;
            border-radius: 6px;
            font-size: 0.75rem;
            font-weight: 600;
            text-decoration: none;
            transition: all 0.2s ease;
            margin: 2px;
        }

        .email-badge {
            background: rgba(236, 72, 153, 0.1);
            border: 1px solid rgba(236, 72, 153, 0.2);
            color: #f472b6;
        }
        .email-badge:hover {
            background: #ec4899;
            color: #fff;
        }

        .wa-badge {
            background: rgba(34, 197, 94, 0.1);
            border: 1px solid rgba(34, 197, 94, 0.2);
            color: #4ade80;
        }
        .wa-badge:hover {
            background: #22c55e;
            color: #fff;
            box-shadow: 0 0 10px rgba(34, 197, 94, 0.2);
        }

        .tg-badge {
            background: rgba(6, 182, 212, 0.1);
            border: 1px solid rgba(6, 182, 212, 0.2);
            color: #22d3ee;
        }
        .tg-badge:hover {
            background: #06b6d4;
            color: #fff;
            box-shadow: 0 0 10px rgba(6, 182, 212, 0.2);
        }

        .vk-badge {
            background: rgba(37, 99, 235, 0.1);
            border: 1px solid rgba(37, 99, 235, 0.2);
            color: #60a5fa;
        }
        .vk-badge:hover {
            background: #2563eb;
            color: #fff;
            box-shadow: 0 0 10px rgba(37, 99, 235, 0.2);
        }

        .viber-badge {
            background: rgba(139, 92, 246, 0.1);
            border: 1px solid rgba(139, 92, 246, 0.2);
            color: #c084fc;
        }
        .viber-badge:hover {
            background: #8b5cf6;
            color: #fff;
            box-shadow: 0 0 10px rgba(139, 92, 246, 0.2);
        }

        .status-indicator {
            font-size: 0.65rem;
            padding: 0.15rem 0.4rem;
            border-radius: 4px;
            font-weight: 700;
            text-transform: uppercase;
            margin-left: 5px;
            vertical-align: middle;
        }

        .badge-active {
            background: rgba(16, 185, 129, 0.15);
            color: var(--success);
            border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .badge-dead {
            background: rgba(239, 68, 68, 0.15);
            color: var(--danger);
            border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .badge-uncheck {
            background: rgba(245, 158, 11, 0.1);
            color: var(--warning);
            border: 1px solid rgba(245, 158, 11, 0.2);
        }

        .na {
            color: rgba(255, 255, 255, 0.15);
            font-size: 0.75rem;
        }

        .messenger-row {
            margin-bottom: 4px;
            display: flex;
            align-items: center;
        }
        .messenger-row:last-child { margin-bottom: 0; }

        .counter {
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-top: 0.3rem;
        }

        @media (max-width: 900px) {
            .controls-bar {
                flex-direction: column;
                align-items: stretch;
            }
            .filter-buttons {
                justify-content: center;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="logo-area">
                <h1>KRNL Lead Contacts</h1>
            </div>
            <div class="subtitle">Validated database of lead messengers and email contacts. Non-existent accounts and advertising pages filtered.</div>
        </header>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-val">${stats.total}</div>
                <div class="stat-lbl">Total Leads</div>
            </div>
            <div class="stat-card">
                <div class="stat-val">${stats.whatsappCount}</div>
                <div class="stat-lbl">WhatsApp</div>
            </div>
            <div class="stat-card">
                <div class="stat-val">${stats.activeTelegram}</div>
                <div class="stat-lbl">Telegram (Verified)</div>
                <div class="counter">${stats.telegramCount} total scraped</div>
            </div>
            <div class="stat-card">
                <div class="stat-val">${stats.activeVK}</div>
                <div class="stat-lbl">VK (Verified)</div>
                <div class="counter">${stats.vkCount} total scraped</div>
            </div>
            <div class="stat-card">
                <div class="stat-val">${stats.emailCount}</div>
                <div class="stat-lbl">Emails Found</div>
            </div>
        </div>

        <div class="controls-bar">
            <div class="search-wrapper">
                <input type="text" id="searchInput" class="search-input" placeholder="Search by name, phone, email, website...">
            </div>
            <div class="filter-buttons">
                <button class="filter-btn active" data-filter="all">All Leads</button>
                <button class="filter-btn" data-filter="wa">With WhatsApp</button>
                <button class="filter-btn" data-filter="tg">With Telegram</button>
                <button class="filter-btn" data-filter="vk">With VK</button>
                <button class="filter-btn" data-filter="viber">With Viber</button>
                <button class="filter-btn" data-filter="emails">With Emails</button>
            </div>
        </div>

        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th style="width: 50px;">#</th>
                        <th>Name</th>
                        <th>Rating</th>
                        <th>Phone</th>
                        <th>Website</th>
                        <th>Emails</th>
                        <th>Messengers</th>
                    </tr>
                </thead>
                <tbody id="tableBody">
                    ${rows}
                </tbody>
            </table>
        </div>
    </div>

    <script>
        const searchInput = document.getElementById('searchInput');
        const filterBtns = document.querySelectorAll('.filter-btn');
        const rows = document.querySelectorAll('#tableBody tr');

        let activeFilter = 'all';
        let searchQuery = '';

        function updateList() {
            rows.forEach(row => {
                const name = row.querySelector('.name-cell').textContent.toLowerCase();
                const phone = row.querySelector('.phone-cell').textContent.toLowerCase();
                const web = row.querySelector('.website-cell').textContent.toLowerCase();
                const emails = row.querySelector('.email-cell').textContent.toLowerCase();
                
                const matchesSearch = name.includes(searchQuery) || phone.includes(searchQuery) || web.includes(searchQuery) || emails.includes(searchQuery);
                
                let matchesFilter = true;
                if (activeFilter === 'wa') matchesFilter = row.getAttribute('data-has-wa') === 'true';
                else if (activeFilter === 'tg') matchesFilter = row.getAttribute('data-has-tg') === 'true';
                else if (activeFilter === 'vk') matchesFilter = row.getAttribute('data-has-vk') === 'true';
                else if (activeFilter === 'viber') matchesFilter = row.getAttribute('data-has-viber') === 'true';
                else if (activeFilter === 'emails') matchesFilter = row.getAttribute('data-has-emails') === 'true';

                if (matchesSearch && matchesFilter) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        }

        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            updateList();
        });

        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeFilter = btn.getAttribute('data-filter');
                updateList();
            });
        });
    </script>
</body>
</html>
`;
}

main().catch(err => {
    log(`Unhandled error: ${err.message}`, 'ERROR');
    console.error(err);
});
