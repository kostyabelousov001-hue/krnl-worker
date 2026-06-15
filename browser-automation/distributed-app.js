const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const {
    cleanText,
    findContactDetails,
    findContactDetailsBatch,
    extractPlaceDetails,
    extractPlaceDetailsBatch,
    scrollFeed,
    setupResourceBlocking
} = require('./stealth-scraper');

const csvPath  = path.join(__dirname, 'leads.csv');
const jsonPath = path.join(__dirname, 'leads_temp.ndjson'); // промежуточный файл (не открывай в Excel)

// --- STATE MANAGEMENT ---
const state = {
    role: 'IDLE', // 'HOST', 'WORKER', 'IDLE'
    query: 'real estate Dubai',
    maxPasses: 5,
    currentPass: 0,
    wsServer: null,
    wsClient: null,
    connectedWorkers: [], // For Host: { id, ws, status, ip, browser }
    hostUrl: 'ws://localhost:8000',
    port: 8000,
    phase: 'IDLE',
    discoveredCount: 0,
    extractedCount: 0,
    crawledCount: 0,
    totalToProcess: 0,
    speedSec: 0,
    speedMin: 0,
    leads: [],
    logs: [],
    inputMode: null,
    inputValue: '',
    detailsQueue: [],
    webQueue: [],
    phaseStartTime: 0,
    diffStats: { new: 0, changed: 0, removed: 0 }
};

const BATCH_SIZE = 25; // 🔥 Increased from 10 to 25

function log(msg) {
    const time = new Date().toLocaleTimeString();
    state.logs.push(`[${time}] ${msg}`);
    if (state.logs.length > 15) state.logs.shift();
}

// 🔥 Промежуточное сохранение → NDJSON (не конфликтует с Excel)
function saveToJson(leadsList) {
    try {
        const lines = leadsList.map(l => JSON.stringify(l)).join('\n');
        fs.writeFileSync(jsonPath, lines, 'utf8');
    } catch (e) {}
}

// 🔥 Финальная конвертация NDJSON → CSV (вызывается один раз в конце)
const saveToCache = (leads) => saveToJson(leads);

function loadExistingLeads() {
    state.leads = [];
    if (fs.existsSync(jsonPath)) {
        try {
            const raw = fs.readFileSync(jsonPath, 'utf8').trim();
            if (raw) {
                state.leads = raw.split('\n').map(l => {
                    try { 
                        const obj = JSON.parse(l);
                        if (obj) {
                            if (obj.name) obj.name = cleanText(obj.name);
                            if (obj.phone) obj.phone = cleanText(obj.phone);
                            if (obj.website) obj.website = cleanText(obj.website);
                        }
                        return obj;
                    } catch { return null; }
                }).filter(Boolean);
                log(`Loaded ${state.leads.length} existing leads from cache.`);
            }
        } catch (e) {
            log(`Error loading cache: ${e.message}`);
        }
    }
}

function removeDuplicates(leadsList) {
    const seen = new Set();
    return leadsList.filter(lead => {
        // Если есть уникальный URL на картах, используем его как первичный ключ
        const urlKey = (lead.url || '').toLowerCase().trim();
        if (urlKey && urlKey.includes('/maps/place/')) {
            if (seen.has(urlKey)) return false;
            seen.add(urlKey);
            return true;
        }

        const nameKey = (lead.name || '').toLowerCase().trim();
        const phoneKey = (lead.phone || '').replace(/\D/g, '');
        const websiteKey = (lead.website || '').toLowerCase().trim();
        
        let key = nameKey;
        if (phoneKey && phoneKey !== 'na' && phoneKey !== 'n/a') key += `_${phoneKey}`;
        else if (websiteKey && websiteKey !== 'na' && websiteKey !== 'n/a') key += `_${websiteKey}`;
        
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function escapeHtml(text) {
    if (!text) return 'N/A';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeXml(unsafe) {
    if (!unsafe) return 'N/A';
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

function generateHTMLReport(leads) {
    const htmlPath = path.join(__dirname, 'leads.html');
    const rows = leads.map((l, idx) => `
        <tr style="--animation-order: ${idx};">
            <td class="num-cell">${idx + 1}</td>
            <td class="name-cell">${escapeHtml(l.name || 'N/A')}</td>
            <td class="rating-cell">${l.rating && l.rating !== 'N/A' ? `⭐ <span>${l.rating}</span>` : '<span class="na">N/A</span>'}</td>
            <td class="reviews-cell">${l.reviews && l.reviews !== 'N/A' ? l.reviews : '0'}</td>
            <td class="phone-cell">${l.phone && l.phone !== 'N/A' ? `<a href="tel:${l.phone.replace(/\s+/g, '')}">${escapeHtml(l.phone)}</a>` : '<span class="na">N/A</span>'}</td>
            <td class="website-cell">${l.website && l.website !== 'N/A' ? `<a href="${l.website.startsWith('http') ? l.website : 'http://' + l.website}" target="_blank" class="web-btn">🌐 Visit</a>` : '<span class="na">N/A</span>'}</td>
            <td class="email-cell">${l.emails && l.emails !== 'N/A' ? l.emails.split(', ').map(em => `<a href="mailto:${em}" class="email-badge">${escapeHtml(em)}</a>`).join(' ') : '<span class="na">N/A</span>'}</td>
        </tr>
    `).join('\n');

    const htmlContent = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KRNL Lightning Scraper - Leads Report</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-grad: radial-gradient(circle at 50% 0%, #1e1b4b 0%, #0f0c1b 50%, #050508 100%);
            --panel-bg: rgba(20, 20, 35, 0.65);
            --border-glow: rgba(99, 102, 241, 0.15);
            --accent: #6366f1;
            --accent-glow: rgba(99, 102, 241, 0.4);
            --gold: #fbbf24;
            --text-main: #f3f4f6;
            --text-muted: #9ca3af;
            --success: #10b981;
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
        .container { max-width: 1400px; margin: 0 auto; }
        header {
            display: flex;
            flex-direction: column;
            gap: 1.2rem;
            margin-bottom: 3rem;
            text-align: center;
            align-items: center;
        }
        .logo-area {
            display: flex;
            align-items: center;
            gap: 10px;
            background: rgba(99, 102, 241, 0.1);
            border: 1px solid rgba(99, 102, 241, 0.2);
            padding: 0.5rem 1.2rem;
            border-radius: 50px;
            box-shadow: 0 0 20px rgba(99, 102, 241, 0.05);
        }
        .logo-area span {
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 2px;
            font-weight: 700;
            color: #818cf8;
        }
        h1 {
            font-size: 3rem;
            font-weight: 800;
            background: linear-gradient(135deg, #ffffff 30%, #a5b4fc 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            letter-spacing: -1px;
        }
        header p { color: var(--text-muted); font-size: 1.1rem; max-width: 600px; }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 1.5rem;
            margin-bottom: 3rem;
        }
        .stat-card {
            background: var(--panel-bg);
            backdrop-filter: blur(16px);
            border: 1px solid var(--border-glow);
            padding: 1.5rem;
            border-radius: 1.25rem;
            position: relative;
            overflow: hidden;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .stat-card:hover {
            transform: translateY(-4px);
            border-color: rgba(99, 102, 241, 0.3);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(99, 102, 241, 0.1);
        }
        .stat-card::before {
            content: '';
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            background: linear-gradient(180deg, rgba(99,102,241,0.05) 0%, transparent 100%);
            pointer-events: none;
        }
        .stat-title {
            font-size: 0.9rem;
            color: var(--text-muted);
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 0.5rem;
        }
        .stat-value {
            font-size: 2.2rem;
            font-weight: 800;
            color: #ffffff;
            display: flex;
            align-items: baseline;
            gap: 5px;
        }
        .stat-value span { font-size: 1rem; color: var(--text-muted); font-weight: 400; }
        .export-section {
            background: var(--panel-bg);
            backdrop-filter: blur(16px);
            border: 1px solid var(--border-glow);
            padding: 1.5rem;
            border-radius: 1.25rem;
            margin-bottom: 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1.5rem;
        }
        .export-title { font-weight: 600; font-size: 1.1rem; color: #ffffff; }
        .export-buttons { display: flex; gap: 0.8rem; flex-wrap: wrap; }
        .export-btn {
            padding: 0.6rem 1.2rem;
            border-radius: 0.75rem;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(255, 255, 255, 0.03);
            color: var(--text-main);
            text-decoration: none;
            font-size: 0.9rem;
            font-weight: 600;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .export-btn:hover {
            background: rgba(99, 102, 241, 0.15);
            border-color: var(--accent);
            box-shadow: 0 0 15px rgba(99, 102, 241, 0.2);
            transform: translateY(-2px);
        }
        .controls { margin-bottom: 1.5rem; position: relative; }
        .search-wrapper { position: relative; display: flex; align-items: center; }
        .search-icon { position: absolute; left: 1.25rem; color: var(--text-muted); font-size: 1.2rem; pointer-events: none; }
        input[type="text"] {
            width: 100%;
            padding: 1rem 1.25rem 1rem 3.25rem;
            border-radius: 1rem;
            border: 1px solid var(--border-glow);
            background: var(--panel-bg);
            backdrop-filter: blur(16px);
            color: #ffffff;
            font-size: 1.05rem;
            outline: none;
            transition: all 0.3s;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        }
        input[type="text"]:focus {
            border-color: var(--accent);
            box-shadow: 0 0 25px rgba(99, 102, 241, 0.2), 0 4px 20px rgba(0, 0, 0, 0.3);
        }
        .table-card {
            background: var(--panel-bg);
            backdrop-filter: blur(16px);
            border: 1px solid var(--border-glow);
            border-radius: 1.25rem;
            overflow: hidden;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
        }
        .table-responsive { overflow-x: auto; width: 100%; }
        table { width: 100%; border-collapse: collapse; text-align: left; }
        th {
            background: rgba(15, 15, 25, 0.6);
            padding: 1.2rem 1.5rem;
            font-size: 0.85rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: #818cf8;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        td {
            padding: 1.2rem 1.5rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            font-size: 0.95rem;
            vertical-align: middle;
            color: var(--text-main);
            transition: background 0.2s;
        }
        tr:last-child td { border-bottom: none; }
        tr {
            animation: fadeInUp 0.4s ease forwards;
            opacity: 0;
            animation-delay: calc(var(--animation-order) * 0.03s);
        }
        tr:hover td { background: rgba(255, 255, 255, 0.02); }
        .num-cell { color: var(--text-muted); font-weight: 600; width: 60px; }
        .name-cell { font-weight: 700; color: #ffffff; font-size: 1rem; }
        .rating-cell { color: var(--gold); font-weight: 700; white-space: nowrap; }
        .rating-cell span { color: #ffffff; margin-left: 4px; }
        .reviews-cell { font-weight: 600; color: #e5e7eb; }
        .na { color: var(--text-muted); font-style: italic; font-size: 0.85rem; }
        a { color: #a5b4fc; text-decoration: none; transition: all 0.2s; }
        a:hover { color: #e0e7ff; text-decoration: underline; }
        .phone-cell a { font-weight: 500; }
        .web-btn {
            display: inline-flex;
            align-items: center;
            padding: 0.4rem 0.8rem;
            background: rgba(99, 102, 241, 0.1);
            border: 1px solid rgba(99, 102, 241, 0.2);
            border-radius: 0.5rem;
            font-size: 0.85rem;
            font-weight: 600;
            color: #a5b4fc !important;
            text-decoration: none !important;
        }
        .web-btn:hover {
            background: var(--accent);
            color: #ffffff !important;
            box-shadow: 0 0 10px rgba(99, 102, 241, 0.3);
        }
        .email-badge {
            display: inline-block;
            padding: 0.25rem 0.6rem;
            background: rgba(16, 185, 129, 0.1);
            border: 1px solid rgba(16, 185, 129, 0.2);
            color: #34d399 !important;
            border-radius: 4px;
            font-size: 0.85rem;
            font-weight: 600;
            margin: 2px;
            text-decoration: none !important;
        }
        .email-badge:hover {
            background: rgba(16, 185, 129, 0.25);
            box-shadow: 0 0 10px rgba(16, 185, 129, 0.2);
        }
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 768px) {
            header h1 { font-size: 2.2rem; }
            body { padding: 1.5rem 1rem; }
            .export-section { flex-direction: column; align-items: flex-start; }
            .export-buttons { width: 100%; }
            .export-btn { flex: 1; justify-content: center; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="logo-area">
                <span>⚡ Live Dashboard</span>
            </div>
            <h1>KRNL Scraper Leads</h1>
            <p>Экспортированные лиды с Google Maps и веб-сайтов. Все дубликаты отфильтрованы, контактные данные обогащены автоматически.</p>
        </header>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-title">Всего лидов</div>
                <div class="stat-value" id="total-count">${leads.length}</div>
            </div>
            <div class="stat-card">
                <div class="stat-title">С телефонами</div>
                <div class="stat-value">${leads.filter(l => l.phone && l.phone !== 'N/A').length} <span>(${((leads.filter(l => l.phone && l.phone !== 'N/A').length / leads.length) * 100 || 0).toFixed(0)}%)</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-title">С сайтами</div>
                <div class="stat-value">${leads.filter(l => l.website && l.website !== 'N/A').length} <span>(${((leads.filter(l => l.website && l.website !== 'N/A').length / leads.length) * 100 || 0).toFixed(0)}%)</span></div>
            </div>
            <div class="stat-card">
                <div class="stat-title">С почтой (Emails)</div>
                <div class="stat-value">${leads.filter(l => l.emails && l.emails !== 'N/A').length} <span>(${((leads.filter(l => l.emails && l.emails !== 'N/A').length / leads.length) * 100 || 0).toFixed(0)}%)</span></div>
            </div>
        </div>

        <div class="export-section">
            <div class="export-title">📥 Скачать в других форматах:</div>
            <div class="export-buttons">
                <a href="leads.csv" download class="export-btn">📄 CSV (Excel)</a>
                <a href="leads.xls" download class="export-btn">📊 Excel XML</a>
                <a href="leads.json" download class="export-btn">📦 JSON</a>
                <a href="leads.md" download class="export-btn">📝 Markdown</a>
                <a href="leads.xml" download class="export-btn">🌐 XML</a>
                <a href="leads.tsv" download class="export-btn">📋 TSV</a>
            </div>
        </div>

        <div class="controls">
            <div class="search-wrapper">
                <span class="search-icon">🔍</span>
                <input type="text" id="search-input" placeholder="Поиск по названию, телефону, сайту, почте...">
            </div>
        </div>

        <div class="table-card">
            <div class="table-responsive">
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Название компании</th>
                            <th>Рейтинг</th>
                            <th>Отзывы</th>
                            <th>Телефон</th>
                            <th>Сайт</th>
                            <th>Электронная почта</th>
                        </tr>
                    </thead>
                    <tbody id="table-body">
                        ${rows}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        const searchInput = document.getElementById('search-input');
        const tableBody = document.getElementById('table-body');
        const rows = Array.from(tableBody.querySelectorAll('tr'));
        const totalCount = document.getElementById('total-count');

        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase().trim();
            let visibleCount = 0;
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                if (text.includes(val)) {
                    row.style.display = '';
                    visibleCount++;
                } else {
                    row.style.display = 'none';
                }
            });
            totalCount.textContent = visibleCount;
        });
    </script>
</body>
</html>`;
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
}

function generateMarkdownReport(leads) {
    try {
        const mdPath = path.join(__dirname, 'leads.md');
        const header = '| # | Business Name | Rating | Reviews | Phone | Website | Emails |\n|---|---|---|---|---|---|---|\n';
        const rows = leads.map((l, idx) => {
            const ratingVal = l.rating && l.rating !== 'N/A' ? l.rating.replace(/[="]/g, '') : 'N/A';
            return `| ${idx + 1} | ${l.name || 'N/A'} | ${ratingVal} | ${l.reviews || '0'} | ${l.phone || 'N/A'} | ${l.website || 'N/A'} | ${l.emails || 'N/A'} |`;
        }).join('\n');
        fs.writeFileSync(mdPath, header + rows, 'utf8');
        log(`✓ Markdown сохранён: leads.md`);
    } catch (e) {
        log(`Ошибка Markdown экспорта: ${e.message}`);
    }
}

function generateXMLReport(leads) {
    try {
        const xmlPath = path.join(__dirname, 'leads.xml');
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<leads>\n';
        leads.forEach((l, idx) => {
            xml += `  <lead id="${idx + 1}">\n`;
            xml += `    <name>${escapeXml(l.name)}</name>\n`;
            xml += `    <rating>${l.rating && l.rating !== 'N/A' ? l.rating.replace(/[="]/g, '') : 'N/A'}</rating>\n`;
            xml += `    <reviews>${l.reviews || '0'}</reviews>\n`;
            xml += `    <phone>${escapeXml(l.phone)}</phone>\n`;
            xml += `    <website>${escapeXml(l.website)}</website>\n`;
            xml += `    <emails>${escapeXml(l.emails)}</emails>\n`;
            xml += `  </lead>\n`;
        });
        xml += '</leads>';
        fs.writeFileSync(xmlPath, xml, 'utf8');
        log(`✓ XML сохранён: leads.xml`);
    } catch (e) {
        log(`Ошибка XML экспорта: ${e.message}`);
    }
}

function generateTSVReport(leads) {
    try {
        const tsvPath = path.join(__dirname, 'leads.tsv');
        const header = 'Business Name\tRating\tReview Count\tPhone\tWebsite\tEmails\n';
        const rows = leads.map(l => [
            l.name   || 'N/A',
            (l.rating && l.rating !== 'N/A') ? l.rating.replace(/[="]/g, '') : 'N/A',
            l.reviews || '0',
            l.phone   || 'N/A',
            l.website || 'N/A',
            l.emails  || 'N/A'
        ].join('\t')).join('\n');
        fs.writeFileSync(tsvPath, header + rows, 'utf8');
        log(`✓ TSV сохранён: leads.tsv`);
    } catch (e) {
        log(`Ошибка TSV экспорта: ${e.message}`);
    }
}

function generateExcelXMLReport(leads) {
    try {
        const xlsPath = path.join(__dirname, 'leads.xls');
        let rowsXml = '';
        leads.forEach(l => {
            const ratingVal = l.rating && l.rating !== 'N/A' ? l.rating.replace(/[="]/g, '') : '';
            const reviewsVal = l.reviews || '0';
            rowsXml += '   <Row>\n';
            rowsXml += `    <Cell><Data ss:Type="String">${escapeXml(l.name || 'N/A')}</Data></Cell>\n`;
            rowsXml += `    <Cell><Data ss:Type="${ratingVal ? 'Number' : 'String'}">${ratingVal || 'N/A'}</Data></Cell>\n`;
            rowsXml += `    <Cell><Data ss:Type="Number">${reviewsVal}</Data></Cell>\n`;
            rowsXml += `    <Cell><Data ss:Type="String">${escapeXml(l.phone || 'N/A')}</Data></Cell>\n`;
            rowsXml += `    <Cell><Data ss:Type="String">${escapeXml(l.website || 'N/A')}</Data></Cell>\n`;
            rowsXml += `    <Cell><Data ss:Type="String">${escapeXml(l.emails || 'N/A')}</Data></Cell>\n`;
            rowsXml += '   </Row>\n';
        });

        const xlsContent = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Author>KRNL Scraper</Author>
  <Created>${new Date().toISOString()}</Created>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Bottom"/>
   <Borders/>
   <Font ss:FontName="Calibri" x:CharSet="204" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="Header">
   <Font ss:FontName="Calibri" x:CharSet="204" x:Family="Swiss" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#1F4E78" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Leads">
  <Table>
   <Column ss:Width="200"/>
   <Column ss:Width="60"/>
   <Column ss:Width="80"/>
   <Column ss:Width="120"/>
   <Column ss:Width="180"/>
   <Column ss:Width="180"/>
   <Row ss:Height="20">
    <Cell ss:StyleID="Header"><Data ss:Type="String">Business Name</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Rating</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Review Count</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Phone</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Website</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Emails</Data></Cell>
   </Row>
${rowsXml}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <Selected/>
   <ProtectObjects>False</ProtectObjects>
   <ProtectScenarios>False</ProtectScenarios>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;

        fs.writeFileSync(xlsPath, xlsContent, 'utf8');
        log(`✓ Excel XLS сохранён: leads.xls`);
    } catch (e) {
        log(`Ошибка Excel XLS экспорта: ${e.message}`);
    }
}

function drawConsoleTable(leads) {
    if (leads.length === 0) return;
    
    const columns = [
        { title: 'Business Name', width: 32 },
        { title: 'Rating', width: 8 },
        { title: 'Reviews', width: 9 },
        { title: 'Phone', width: 18 },
        { title: 'Website', width: 22 }
    ];
    
    const hr = '┌' + columns.map(c => '─'.repeat(c.width)).join('┬') + '┐';
    const separator = '├' + columns.map(c => '─'.repeat(c.width)).join('┼') + '┤';
    const bottom = '└' + columns.map(c => '─'.repeat(c.width)).join('┴') + '┘';
    
    console.log('\n\x1b[36m\x1b[1m' + '📊 TOP RESULTS PREVIEW:' + '\x1b[0m');
    console.log(hr);
    
    const headerRow = '│' + columns.map(c => {
        return ' ' + c.title.padEnd(c.width - 2) + ' ';
    }).join('│') + '│';
    console.log(headerRow);
    console.log(separator);
    
    leads.slice(0, 15).forEach(l => {
        const ratingVal = l.rating && l.rating !== 'N/A' ? l.rating.replace(/[="]/g, '') : 'N/A';
        const reviewsVal = l.reviews || '0';
        const phoneVal = l.phone || 'N/A';
        const websiteVal = l.website || 'N/A';
        
        const nameText = String(l.name || 'N/A').slice(0, 30).padEnd(30);
        const ratingText = '\x1b[33m' + String(ratingVal).padEnd(6) + '\x1b[0m';
        const reviewsText = String(reviewsVal).padEnd(7);
        const phoneText = '\x1b[32m' + String(phoneVal).slice(0, 16).padEnd(16) + '\x1b[0m';
        const websiteText = String(websiteVal).slice(0, 20).padEnd(20);
        
        console.log(`│ ${nameText} │ ${ratingText} │ ${reviewsText} │ ${phoneText} │ ${websiteText} │`);
    });
    
    console.log(bottom);
    if (leads.length > 15) {
        console.log(`\x1b[2m... and ${leads.length - 15} more rows saved to files.\x1b[0m\n`);
    }
}

function getConsoleTableString(leads) {
    if (leads.length === 0) return '  [No leads collected yet]';
    
    const cyan = '\x1b[36m';
    const yellow = '\x1b[33m';
    const green = '\x1b[32m';
    const reset = '\x1b[0m';
    const bold = '\x1b[1m';
    const gray = '\x1b[90m';
    const magenta = '\x1b[35m';

    const columns = [
        { title: '#', width: 3 },
        { title: 'Business Name', width: 28 },
        { title: 'Rating', width: 7 },
        { title: 'Reviews', width: 8 },
        { title: 'Phone', width: 16 },
        { title: 'Emails / Website', width: 24 }
    ];

    // Символы рамок
    const topBorder = '  ┌' + columns.map(c => '─'.repeat(c.width + 2)).join('┬') + '┐';
    const headerBorder = '  ├' + columns.map(c => '─'.repeat(c.width + 2)).join('┼') + '┤';
    const bottomBorder = '  └' + columns.map(c => '─'.repeat(c.width + 2)).join('┴') + '┘';

    let output = [];
    output.push(topBorder);
    
    // Заголовок
    const headerRow = '  │' + columns.map(c => {
        return ' ' + bold + cyan + c.title.padEnd(c.width) + reset + ' ';
    }).join('│') + '│';
    output.push(headerRow);
    output.push(headerBorder);

    // Только последние 10 лидов или топ-10
    const displayLeads = leads.slice(-10); // Показываем последние 10 добавленных

    displayLeads.forEach((l, i) => {
        const globalIdx = leads.length - displayLeads.length + i + 1;
        const numStr = String(globalIdx).padStart(3);
        
        let ratingVal = l.rating && l.rating !== 'N/A' ? l.rating.replace(/[="]/g, '') : 'N/A';
        const ratingStr = ratingVal !== 'N/A' ? `⭐ ${ratingVal}` : 'N/A';
        const reviewsStr = String(l.reviews || '0');
        const phoneStr = l.phone || 'N/A';
        
        let contactStr = 'N/A';
        if (l.emails && l.emails !== 'N/A') {
            contactStr = l.emails.split(', ')[0];
        } else if (l.website && l.website !== 'N/A') {
            contactStr = l.website;
        }

        const cleanName = (l.name || 'N/A').substring(0, columns[1].width);
        const nameText = cleanName.padEnd(columns[1].width);
        
        let ratingColor = ratingVal !== 'N/A' ? yellow : gray;
        const ratingText = ratingColor + ratingStr.substring(0, columns[2].width).padEnd(columns[2].width) + reset;
        
        const reviewsText = reviewsStr.substring(0, columns[3].width).padEnd(columns[3].width);
        
        let phoneColor = phoneStr !== 'N/A' ? green : gray;
        const phoneText = phoneColor + phoneStr.substring(0, columns[4].width).padEnd(columns[4].width) + reset;
        
        let contactColor = (l.emails && l.emails !== 'N/A') ? magenta : (contactStr !== 'N/A' ? cyan : gray);
        const contactText = contactColor + contactStr.substring(0, columns[5].width).padEnd(columns[5].width) + reset;

        const row = `  │ ${gray}${numStr}${reset} │ ${bold}${nameText}${reset} │ ${ratingText} │ ${reviewsText} │ ${phoneText} │ ${contactText} │`;
        output.push(row);
    });

    output.push(bottomBorder);
    
    if (leads.length > 10) {
        output.push(`  ${gray}... и еще ${leads.length - 10} лидов сохранено в файлы (CSV, XLS, HTML, JSON, XML, MD, TSV).${reset}`);
    }
    
    return output.join('\n');
}

// Compute diff between old and new leads
function computeDiff(oldLeads, newLeads) {
    const oldMap = new Map();
    oldLeads.forEach(l => { if (l.url) oldMap.set(l.url, l); });

    let newCount = 0, changedCount = 0, removedCount = 0;
    const newEntries = [];

    newLeads.forEach(l => {
        if (!l.url) return;
        const old = oldMap.get(l.url);
        if (!old) {
            newCount++;
            newEntries.push(l);
        } else {
            let changed = false;
            if (old.rating !== l.rating && l.rating !== 'N/A') changed = true;
            if (old.reviews !== l.reviews && l.reviews !== '0') changed = true;
            if (old.phone !== l.phone && l.phone !== 'N/A') changed = true;
            if (changed) changedCount++;
        }
    });

    oldLeads.forEach(l => {
        if (l.url && !newLeads.some(n => n.url === l.url)) removedCount++;
    });

    return { new: newCount, changed: changedCount, removed: removedCount, newEntries };
}

function finalizeOutputs() {
    try {
        if (!fs.existsSync(jsonPath)) return;
        const raw = fs.readFileSync(jsonPath, 'utf8').trim();
        if (!raw) return;
        
        let leads = raw.split('\n').map(l => {
            try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean);

        leads = removeDuplicates(leads);
        saveToJson(leads);

        const header = 'Business Name;Rating;Review Count;Phone;Website;Emails\n';
        const rows = leads.map(l => [
            l.name   || 'N/A',
            (l.rating && l.rating !== 'N/A') ? ('="' + l.rating.replace(/[="]/g, '') + '"') : 'N/A',
            l.reviews || '0',
            l.phone   || 'N/A',
            l.website || 'N/A',
            l.emails  || 'N/A'
        ].map(cell => {
            const s = String(cell);
            if (s.startsWith('="') && s.endsWith('"') && !s.slice(2, -1).includes(';') && !s.slice(2, -1).includes('"')) {
                return s;
            }
            return (s.includes(';') || s.includes('"')) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(';')).join('\n');

        fs.writeFileSync(csvPath, '\ufeff' + header + rows, 'utf8');
        log(`✓ CSV сохранён: ${leads.length} лидов → leads.csv`);

        const jsonOutputPath = path.join(__dirname, 'leads.json');
        fs.writeFileSync(jsonOutputPath, JSON.stringify(leads, null, 2), 'utf8');
        log(`✓ JSON сохранён: leads.json`);

        generateHTMLReport(leads);
        log(`✓ HTML-отчёт сохранён: leads.html`);

        // Новые форматы
        generateMarkdownReport(leads);
        generateXMLReport(leads);
        generateExcelXMLReport(leads);
        generateTSVReport(leads);

    } catch (e) {
        log(`Ошибка сохранения выходных файлов: ${e.message}`);
    }
}

// --- TUI RENDERER ---
function renderTUI() {
    process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
    
    const bold = '\x1b[1m';
    const cyan = '\x1b[36m';
    const green = '\x1b[32m';
    const yellow = '\x1b[33m';
    const magenta = '\x1b[35m';
    const red = '\x1b[31m';
    const reset = '\x1b[0m';
    const gray = '\x1b[90m';

    const w = 98;
    console.log(`${cyan}┌${'─'.repeat(w - 2)}┐${reset}`);
    const title = `⚡ KRNL LIGHTNING DISTRIBUTED CRAWLER v1.2 ⚡`;
    const titlePadding = Math.floor((w - 2 - title.length) / 2);
    console.log(`${cyan}│${reset}${' '.repeat(titlePadding)}${bold}${yellow}${title}${reset}${' '.repeat(w - 2 - titlePadding - title.length)}${cyan}│${reset}`);
    console.log(`${cyan}└${'─'.repeat(w - 2)}┘${reset}`);

    let roleText = '';
    if (state.role === 'HOST') {
        roleText = `Role: ${bold}${green}HOST${reset} (cloudflared: http://lol.krnlcamel.space:${state.port}) | Workers: ${bold}${yellow}${state.connectedWorkers.length}${reset}`;
    } else if (state.role === 'WORKER') {
        roleText = `Role: ${bold}${magenta}WORKER${reset} → ${state.hostUrl}`;
    } else {
        roleText = `Role: ${bold}IDLE${reset} (Press H to Host or W to Join)`;
    }

    let queryText = `Query: "${bold}${yellow}${state.query}${reset}" | Pass: ${bold}${state.currentPass}${reset}/${state.maxPasses}${state.phase === 'IDLE' ? '' : ` | New: ${bold}${green}${state.diffStats.new}${reset} Changed: ${bold}${yellow}${state.diffStats.changed}${reset}`}`;
    
    // Выравняем по краям
    const roleCleanLen = state.role === 'HOST' ? (25 + String(state.connectedWorkers.length).length) : (state.role === 'WORKER' ? (12 + state.hostUrl.length) : 34);
    const queryCleanLen = 11 + state.query.length + String(state.currentPass).length + String(state.maxPasses).length;
    const padding = w - 6 - roleCleanLen - queryCleanLen;
    const spaces = padding > 0 ? ' '.repeat(padding) : '  ';
    
    console.log(`  ${roleText}${spaces}${queryText}`);
    
    let phaseColor = reset;
    if (state.phase === 'DISCOVERING_LINKS') phaseColor = yellow;
    else if (state.phase === 'EXTRACTING_DETAILS') phaseColor = cyan;
    else if (state.phase === 'WEB_CRAWLING') phaseColor = magenta;
    else if (state.phase === 'DONE') phaseColor = green;
    console.log(`  Phase: ${bold}${phaseColor}${state.phase}${reset}`);
    console.log(`${cyan}  ${'─'.repeat(w - 4)}${reset}`);

    if (state.phase !== 'IDLE' && state.phase !== 'DONE') {
        const detPct = state.totalToProcess > 0 ? ((state.extractedCount / state.totalToProcess) * 100).toFixed(0) : 0;
        const webPct = state.totalToProcess > 0 ? ((state.crawledCount / state.totalToProcess) * 100).toFixed(0) : 0;
        
        // Progress bars
        const barLength = 20;
        const filledDetails = Math.min(barLength, Math.round((detPct / 100) * barLength));
        const detailsBar = '█'.repeat(filledDetails) + '░'.repeat(barLength - filledDetails);

        const filledWeb = Math.min(barLength, Math.round((webPct / 100) * barLength));
        const webBar = '█'.repeat(filledWeb) + '░'.repeat(barLength - filledWeb);

        console.log(`  [Discover ] ${bold}${state.discoveredCount}${reset} URLs (pass ${state.currentPass}/${state.maxPasses})`);
        console.log(`  [Details  ] [${cyan}${detailsBar}${reset}] ${bold}${state.extractedCount}${reset}/${state.totalToProcess} (${detPct}%) | Queue: ${state.detailsQueue.length}`);
        console.log(`  [Websites ] [${magenta}${webBar}${reset}] ${bold}${state.crawledCount}${reset}/${state.totalToProcess} (${webPct}%) | Queue: ${state.webQueue.length}`);
        console.log(`  [Speed    ] ${bold}${state.speedSec}${reset}/s  →  ${bold}${state.speedMin}${reset}/min`);
        console.log(`${cyan}  ${'─'.repeat(w - 4)}${reset}`);
    }

    if (state.phase === 'DONE') {
        console.log(getConsoleTableString(state.leads));
        console.log(`${cyan}  ${'─'.repeat(w - 4)}${reset}`);
    }

    console.log(`  ${bold}DEVICES:${reset}`);
    if (state.role === 'HOST') {
        console.log(`  ● Host (Me) — ${state.phase === 'IDLE' ? `${green}Ready${reset}` : (state.phase === 'DONE' ? `${green}Finished${reset}` : `${yellow}Working${reset}`)}`);
        state.connectedWorkers.forEach(w => {
            console.log(`  ● Worker #${w.id} (${w.ip}) — ${bold}${cyan}${w.status}${reset}`);
        });
    } else if (state.role === 'WORKER') {
        console.log(`  ● Worker (Me) — ${green}connected${reset}`);
    } else {
        console.log("  No devices connected. Press [H] to Host or [W] to Join.");
    }
    console.log(`${cyan}  ${'─'.repeat(w - 4)}${reset}`);

    console.log(`  ${bold}LOG:${reset}`);
    const displayLogs = state.logs.slice(-5);
    while (displayLogs.length < 5) displayLogs.push("");
    displayLogs.forEach(l => {
        if (l.includes('✓') || l.includes('Complete') || l.includes('🏁') || l.includes('сохранён')) {
            console.log(`  ${green}${l}${reset}`);
        } else if (l.includes('Error') || l.includes('Ошибка') || l.includes('❌') || l.includes('⚠️')) {
            console.log(`  ${red}${l}${reset}`);
        } else {
            console.log(`  ${l}`);
        }
    });
    console.log(`${cyan}┌${'─'.repeat(w - 2)}┐${reset}`);

    if (state.inputMode) {
        console.log(`  INPUT [${bold}${yellow}${state.inputMode}${reset}]: ${state.inputValue}_`);
        console.log(`  (Enter = confirm, Esc = cancel)`);
    } else {
        if (state.phase === 'DONE') {
            console.log(`  [${bold}S${reset}] Continue / Restart  [${bold}Q${reset}] Query  [${bold}L${reset}] Passes  [${bold}Esc${reset}] Exit`);
        } else {
            console.log(`  [${bold}H${reset}] Host  [${bold}W${reset}] Join  [${bold}S${reset}] Start  [${bold}Q${reset}] Query  [${bold}L${reset}] Passes  [${bold}Esc${reset}] Exit`);
        }
    }
    console.log(`${cyan}└${'─'.repeat(w - 2)}┘${reset}`);
}

// --- HOST: DISPATCH TASKS TO WORKER ---
function dispatchNextDetailsTask(worker) {
    if (state.detailsQueue.length === 0) {
        worker.status = 'Idle';
        worker.ws.send(JSON.stringify({ type: 'NO_MORE_TASKS' }));
        return;
    }
    const batch = state.detailsQueue.splice(0, BATCH_SIZE);
    worker.status = `Details (${state.detailsQueue.length} left)`;
    worker.ws.send(JSON.stringify({ type: 'TASK_DETAILS', items: batch }));
    renderTUI();
}

function dispatchNextWebTask(worker) {
    if (state.webQueue.length === 0) {
        worker.status = 'Idle';
        worker.ws.send(JSON.stringify({ type: 'NO_MORE_TASKS' }));
        return;
    }
    const batch = state.webQueue.splice(0, BATCH_SIZE);
    worker.status = `Crawling (${state.webQueue.length} left)`;
    worker.ws.send(JSON.stringify({ type: 'TASK_WEB', leads: batch }));
    renderTUI();
}

// --- HOST WS SERVER (HTTP + WS for cloudflared) ---
function startHostServer() {
    state.role = 'HOST';

    const httpServer = http.createServer((req, res) => {
        if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ status: 'ok', workers: state.connectedWorkers.length, phase: state.phase, leads: state.leads.length }));
            return;
        }

        if (req.method === 'GET' && req.url === '/script/worker.js') {
            const scriptPath = path.join(__dirname, 'worker-script.js');
            if (fs.existsSync(scriptPath)) {
                const script = fs.readFileSync(scriptPath, 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/javascript', 'Access-Control-Allow-Origin': '*' });
                res.end(script);
            } else {
                res.writeHead(404);
                res.end('Script not found');
            }
            return;
        }

        if (req.method === 'GET' && req.url === '/config/design.json') {
            const designPath = path.join(__dirname, 'design.json');
            if (fs.existsSync(designPath)) {
                const design = fs.readFileSync(designPath, 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                res.end(design);
            } else {
                res.writeHead(404);
                res.end('Design config not found');
            }
            return;
        }

        res.writeHead(426, { 'Upgrade': 'websocket' });
        res.end('This server accepts WebSocket connections');
    });

    const PORT = parseInt(process.env.PORT) || state.port || 9090;
    state.port = PORT;
    httpServer.listen(PORT, () => {
        log(`HTTP+WS Server on http://0.0.0.0:${PORT} ✓`);
    });

    state.wsServer = new WebSocketServer({ server: httpServer });
    log(`For cloudflared: cloudflared tunnel --url http://localhost:${PORT} --protocol auto krnl-node`);

    state.wsServer.on('connection', (ws, req) => {
        const ip = req.socket.remoteAddress;
        const workerId = Date.now();
        const worker = { id: workerId, ws, status: 'Connected', ip };
        state.connectedWorkers.push(worker);
        log(`Worker #${workerId} joined from ${ip}`);
        renderTUI();

        ws.on('message', (message) => {
            try {
                handleWorkerMessage(workerId, JSON.parse(message));
            } catch (e) {
                log(`Parse error: ${e.message}`);
            }
        });

        ws.on('close', () => {
            state.connectedWorkers = state.connectedWorkers.filter(w => w.id !== workerId);
            log(`Worker #${workerId} left.`);
            renderTUI();
        });
    });
}

function handleWorkerMessage(workerId, data) {
    const worker = state.connectedWorkers.find(w => w.id === workerId);
    if (!worker) return;

    if (data.type === 'STATUS') {
        worker.status = data.status;
        renderTUI();
    } else if (data.type === 'DETAILS_BATCH') {
        state.extractedCount += data.results.length;
        state.leads.push(...data.results);
        saveToCache(state.leads);

        const elapsed = (Date.now() - state.phaseStartTime) / 1000;
        state.speedSec = (state.extractedCount / elapsed).toFixed(2);
        state.speedMin = (state.speedSec * 60).toFixed(1);

        log(`Worker #${workerId}: +${data.results.length} details (total: ${state.extractedCount})`);
        dispatchNextDetailsTask(worker);
    } else if (data.type === 'WEB_BATCH') {
        state.crawledCount += data.results.length;
        data.results.forEach(res => {
            const i = state.leads.findIndex(l => l.name === res.name);
            if (i !== -1) state.leads[i] = res;
        });
        saveToCache(state.leads);

        const elapsed = (Date.now() - state.phaseStartTime) / 1000;
        state.speedSec = (state.crawledCount / elapsed).toFixed(2);
        state.speedMin = (state.speedSec * 60).toFixed(1);

        log(`Worker #${workerId}: +${data.results.length} sites (total: ${state.crawledCount})`);
        dispatchNextWebTask(worker);
    }
}

// --- WORKER WS CLIENT ---
// 🔥 KEY FIX: persistent browser — one per worker session, NOT one per batch
let workerDetailsBrowser = null;
let workerWebBrowser = null;

function startWorkerClient(url) {
    state.role = 'WORKER';
    state.hostUrl = url;
    log(`Connecting to ${url}...`);
    renderTUI();

    state.wsClient = new WebSocket(url);

    state.wsClient.on('open', () => {
        log("Connected to Host ✓");
        state.wsClient.send(JSON.stringify({ type: 'STATUS', status: 'Ready' }));
        renderTUI();
    });

    state.wsClient.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'TASK_DETAILS') {
                log(`Task: extracting ${data.items.length} details...`);
                state.wsClient.send(JSON.stringify({ type: 'STATUS', status: `Details x${data.items.length}` }));

                if (!workerDetailsBrowser) {
                    workerDetailsBrowser = await chromium.launch({
                        headless: true,
                        args: ['--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
                               '--disable-extensions', '--no-first-run']
                    });
                }

                const results = await extractPlaceDetailsBatch(workerDetailsBrowser, data.items, 5);

                state.wsClient.send(JSON.stringify({ type: 'DETAILS_BATCH', results }));
                renderTUI();

            } else if (data.type === 'TASK_WEB') {
                log(`Task: crawling ${data.leads.length} websites...`);
                state.wsClient.send(JSON.stringify({ type: 'STATUS', status: `Web x${data.leads.length}` }));

                // 🔥 Reuse persistent browser
                if (!workerWebBrowser) {
                    workerWebBrowser = await chromium.launch({
                        headless: true,
                        args: ['--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
                               '--disable-extensions', '--no-first-run']
                    });
                }

                const results = await findContactDetailsBatch(workerWebBrowser, data.leads, 5);

                state.wsClient.send(JSON.stringify({ type: 'WEB_BATCH', results }));
                renderTUI();

            } else if (data.type === 'NO_MORE_TASKS') {
                state.wsClient.send(JSON.stringify({ type: 'STATUS', status: 'Idle' }));
                log("Queue empty. Waiting...");
                renderTUI();
            }
        } catch (e) {
            log(`Worker error: ${e.message}`);
            renderTUI();
        }
    });

    state.wsClient.on('close', () => {
        log("Host disconnected.");
        state.role = 'IDLE';
        // Close persistent browsers on disconnect
        if (workerDetailsBrowser) workerDetailsBrowser.close().catch(() => {});
        if (workerWebBrowser) workerWebBrowser.close().catch(() => {});
        workerDetailsBrowser = null;
        workerWebBrowser = null;
        renderTUI();
    });

    state.wsClient.on('error', (err) => {
        log(`Connection error: ${err.message}`);
        state.role = 'IDLE';
        renderTUI();
    });
}

// --- HOST LOCAL WORKER (persistent browser, parallel sub-batches) ---
async function runLocalHostWorker(browser, type) {
    while (true) {
        if (type === 'DETAILS') {
            if (state.detailsQueue.length === 0) break;
            const batch = state.detailsQueue.splice(0, BATCH_SIZE);

            const results = await extractPlaceDetailsBatch(browser, batch, 5);

            state.extractedCount += results.length;
            state.leads.push(...results);
            await saveToCache(state.leads);

            const elapsed = (Date.now() - state.phaseStartTime) / 1000;
            state.speedSec = (state.extractedCount / elapsed).toFixed(2);
            state.speedMin = (state.speedSec * 60).toFixed(1);
            log(`Host extracted +${results.length} (total: ${state.extractedCount})`);
            renderTUI();

        } else if (type === 'WEB') {
            if (state.webQueue.length === 0) break;
            const batch = state.webQueue.splice(0, BATCH_SIZE);

            const results = await findContactDetailsBatch(browser, batch, 5);

            state.crawledCount += results.length;
            results.forEach(res => {
                const i = state.leads.findIndex(l => l.name === res.name);
                if (i !== -1) state.leads[i] = res;
            });
            await saveToCache(state.leads);

            const elapsed = (Date.now() - state.phaseStartTime) / 1000;
            state.speedSec = (state.crawledCount / elapsed).toFixed(2);
            state.speedMin = (state.speedSec * 60).toFixed(1);
            log(`Host crawled +${results.length} (total: ${state.crawledCount})`);
            renderTUI();
        }
    }
}

// --- HOST MAIN JOB ---
async function startScrapeJob() {
    if (state.role !== 'HOST') {
        log("Only the Host can start scraping!");
        return;
    }

    state.phase = 'DISCOVERING_LINKS';
    state.discoveredCount = 0;
    state.extractedCount = 0;
    state.crawledCount = 0;
    state.logs = [];
    
    // Загружаем сохраненный прогресс
    loadExistingLeads();
    log(`Starting discovery: "${state.query}" (max ${state.maxPasses} passes). Existing leads: ${state.leads.length}`);
    renderTUI();

    // 🔥 PHASE 1: Google Maps Link Discovery (Multi-Pass)
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions']
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();
    await page.route('**/*', route => {
        const t = route.request().resourceType();
        if (['image', 'media', 'font'].includes(t)) route.abort();
        else route.continue();
    });

    const encodedQuery = encodeURIComponent(state.query);
    await page.goto(`https://www.google.com/maps/search/${encodedQuery}`, { waitUntil: 'domcontentloaded', timeout: 20000 });

    try {
        const consent = page.locator('button:has-text("Reject all"), button:has-text("Accept all"), button:has-text("Принять"), button:has-text("Отклонить")');
        if (await consent.count() > 0) {
            await consent.first().click({ timeout: 3000 });
            await page.waitForTimeout(800);
        }
    } catch (e) {}

    // Save old leads for diff before starting
    const oldLeadsForDiff = JSON.parse(JSON.stringify(state.leads));

    const allDiscoveredUrls = new Set();
    const placeData = new Map();

    for (let pass = 1; pass <= state.maxPasses; pass++) {
        state.currentPass = pass;
        const totalBeforePass = allDiscoveredUrls.size;
        let noNewCount = 0;
        const urlsThisPass = new Set();

        log(`--- Pass ${pass}/${state.maxPasses} ---`);
        renderTUI();

        if (pass > 1) {
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
            await page.waitForTimeout(1500);
            try {
                const consent = page.locator('button:has-text("Reject all"), button:has-text("Accept all"), button:has-text("Принять"), button:has-text("Отклонить")');
                if (await consent.count() > 0) {
                    await consent.first().click({ timeout: 3000 });
                    await page.waitForTimeout(800);
                }
            } catch (e) {}
            log(`Page refreshed for pass ${pass}`);
            renderTUI();
        }

        try {
            while (true) {
                const before = urlsThisPass.size;

                const extracted = await page.evaluate(() => {
                    const results = [];
                    const cards = document.querySelectorAll('a[href*="/maps/place/"]');
                    cards.forEach(card => {
                        const href = card.href;
                        if (!href) return;
                        const container = card.closest('div[role="article"]') || card.closest('.Nv2PK') || card.parentElement;
                        let rating = 'N/A', reviews = '0';
                        if (container) {
                            const spans = container.querySelectorAll('span');
                            for (const s of spans) {
                                const t = s.textContent.trim().replace(',', '.');
                                const n = parseFloat(t);
                                if (!isNaN(n) && n >= 1.0 && n <= 5.0 && t.length <= 4 && !s.querySelector('span')) {
                                    rating = t;
                                    break;
                                }
                            }
                            const fullText = container.textContent;
                            const rvM = fullText.match(/\((\d[\d\s,.]*)\)/);
                            if (rvM) reviews = rvM[1].replace(/\D/g, '');
                        }
                        results.push({ href, rating, reviews });
                    });
                    return results;
                }).catch(() => []);

                for (const item of extracted) {
                    if (!allDiscoveredUrls.has(item.href)) {
                        allDiscoveredUrls.add(item.href);
                        urlsThisPass.add(item.href);
                        placeData.set(item.href, { rating: item.rating, reviews: item.reviews });
                    }
                }

                state.discoveredCount = allDiscoveredUrls.size;
                renderTUI();

                await page.evaluate(async () => {
                    const feed = document.querySelector('div[role="feed"]');
                    if (feed) {
                        for (let i = 0; i < 10; i++) {
                            feed.scrollBy(0, 600);
                            await new Promise(r => setTimeout(r, 60));
                        }
                        feed.scrollTop = feed.scrollHeight;
                    }
                }).catch(() => {});

                await page.waitForTimeout(500);

                const checkEnd = await page.locator('span:has-text("You\'ve reached the end"), span:has-text("Конец списка")').count().catch(() => 0);
                if (checkEnd > 0) {
                    log(`End of list reached on pass ${pass} (${urlsThisPass.size} new URLs found this pass)`);
                    break;
                }

                if (urlsThisPass.size === before) {
                    noNewCount++;
                    if (noNewCount > 20) {
                        log(`No new items after 20 scrolls this pass.`);
                        break;
                    }
                } else {
                    noNewCount = 0;
                }
            }
        } catch (err) {
            log(`Pass ${pass} error: ${err.message}`);
        }

        const newThisPass = urlsThisPass.size;
        log(`Pass ${pass} complete: +${newThisPass} new URLs (total: ${allDiscoveredUrls.size})`);

        if (newThisPass === 0) {
            log(`No new URLs found on pass ${pass} — stopping.`);
            break;
        }
    }

    await browser.close().catch(() => {});

    const existingUrls = new Set(state.leads.map(l => l.url).filter(Boolean));
    const newUrls = Array.from(allDiscoveredUrls).filter(url => !existingUrls.has(url));
    const skippedCount = allDiscoveredUrls.size - newUrls.length;

    state.totalToProcess = newUrls.length;
    state.detailsQueue = newUrls.map(url => ({ url, ...placeData.get(url) }));
    
    log(`✓ Discovered ${allDiscoveredUrls.size} URLs (skipped ${skippedCount} already scraped).`);

    if (newUrls.length === 0) {
        log("No new URLs to extract details for.");
    } else {
        // 🔥 PHASE 2: Extract details — Host + Workers in parallel
        state.phase = 'EXTRACTING_DETAILS';
        state.phaseStartTime = Date.now();
        renderTUI();

        // Dispatch to remote workers
        state.connectedWorkers.forEach(w => dispatchNextDetailsTask(w));

        // Host runs locally with persistent browser
        const hostDetailsBrowser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions']
        });
        await runLocalHostWorker(hostDetailsBrowser, 'DETAILS');
        await hostDetailsBrowser.close().catch(() => {});

        // Wait for remote workers to drain
        while (state.detailsQueue.length > 0 || state.connectedWorkers.some(w => w.status.includes('Details'))) {
            await new Promise(r => setTimeout(r, 500));
        }
        log(`✓ Details done. ${state.leads.length} total leads collected.`);
    }

    // 🔥 PHASE 3: Web crawl — Host + Workers in parallel
    state.phase = 'WEB_CRAWLING';
    // Crawl only websites that don't have emails yet
    state.webQueue = state.leads.filter(l => !l.emails || l.emails === 'N/A');
    state.totalToProcess = state.webQueue.length;
    state.crawledCount = 0;
    state.phaseStartTime = Date.now();
    renderTUI();

    if (state.webQueue.length === 0) {
        log("No new websites to crawl for emails.");
    } else {
        log(`Starting web crawl for ${state.webQueue.length} websites...`);
        state.connectedWorkers.forEach(w => dispatchNextWebTask(w));

        const hostWebBrowser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions']
        });
        await runLocalHostWorker(hostWebBrowser, 'WEB');
        await hostWebBrowser.close().catch(() => {});

        while (state.webQueue.length > 0 || state.connectedWorkers.some(w => w.status.includes('Crawling'))) {
            await new Promise(r => setTimeout(r, 500));
        }
    }

    state.phase = 'DONE';
    finalizeOutputs();
    const diff = computeDiff(oldLeadsForDiff, state.leads);
    state.diffStats = diff;
    if (diff.new > 0 || diff.changed > 0) {
        log(`📊 Diff: +${diff.new} new | 🔄 ${diff.changed} updated | ❌ ${diff.removed} removed`);
    }
    log(`🏁 Complete! ${state.leads.length} leads processed.`);
    renderTUI();
    if (process.argv.includes('--auto')) {
        log("Auto-mode complete. Exiting...");
        setTimeout(() => process.exit(0), 2000);
    }
}

// --- KEYBOARD INPUT ---
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

process.stdin.on('keypress', (str, key) => {
    if (state.inputMode) {
        if (key.name === 'return') {
            const val = state.inputValue.trim();
            if (state.inputMode === 'QUERY') state.query = val || state.query;
            else if (state.inputMode === 'PASSES') state.maxPasses = parseInt(val) || state.maxPasses;
            else if (state.inputMode === 'WS_URL') {
                state.hostUrl = val || state.hostUrl;
                startWorkerClient(state.hostUrl);
            }
            state.inputMode = null;
            state.inputValue = '';
            renderTUI();
        } else if (key.name === 'escape') {
            state.inputMode = null;
            state.inputValue = '';
            renderTUI();
        } else if (key.name === 'backspace') {
            state.inputValue = state.inputValue.slice(0, -1);
            renderTUI();
        } else if (str && str.length === 1) {
            state.inputValue += str;
            renderTUI();
        }
        return;
    }

    if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        if (state.wsServer) state.wsServer.close();
        if (state.wsClient) state.wsClient.close();
        setTimeout(() => process.exit(0), 300);
    } else if (key.name === 'h') {
        startHostServer();
        renderTUI();
    } else if (key.name === 'w') {
        state.inputMode = 'WS_URL';
        state.inputValue = 'ws://lol.krnlcamel.space';
        renderTUI();
    } else if (key.name === 'q') {
        state.inputMode = 'QUERY';
        state.inputValue = state.query;
        renderTUI();
    } else if (key.name === 'l') {
        state.inputMode = 'PASSES';
        state.inputValue = String(state.maxPasses);
        renderTUI();
    } else if (key.name === 's') {
        if (state.role === 'HOST') startScrapeJob();
        else { log("Press [H] first to become Host!"); renderTUI(); }
    }
});

// --- AUTO-RUN FROM CLI ARGUMENTS ---
const args = process.argv.slice(2);
const autoMode = args.includes('--auto');

if (autoMode) {
    const queryIdx = args.indexOf('--query');
    if (queryIdx !== -1 && args[queryIdx + 1]) {
        state.query = args[queryIdx + 1];
    }
    const passesIdx = args.indexOf('--passes');
    if (passesIdx !== -1 && args[passesIdx + 1]) {
        state.maxPasses = parseInt(args[passesIdx + 1]) || state.maxPasses;
    }
    
    log(`Auto-mode enabled. Query: "${state.query}", Passes: ${state.maxPasses}`);
    startHostServer();
    
    // Allow server setup to complete before launching the scrape job
    setTimeout(() => {
        startScrapeJob();
    }, 1000);
} else {
    state.logs.push("⚡ Lightning Crawler ready.");
    state.logs.push("Press [H] to Host  |  [W] to Join as Worker.");
    renderTUI();
}
