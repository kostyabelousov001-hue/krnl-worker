const { chromium } = require('playwright');
const path = require('path');

const TON_WALLET = 'UQDvz0Bh8hx88bBFPI-JV2xfGAubFngPaDBrl8ldHRHiJOU4';

const TEXTS = {
    ru: {
        title: 'База 110 агентств недвижимости Дубая с почтами и телефонами (июнь 2026)',
        description: `Предлагаю свежую и полностью верифицированную B2B-базу из 110 активных агентств недвижимости в Дубае (районы Marina, Downtown, JBR).

Что входит в базу данных:
- Название компании (агентства)
- Официальный веб-сайт
- Точный рейтинг Google Maps и количество отзывов (собрано с обходом защиты от срезки рейтинга)
- Прямые контактные телефоны компании
- Верифицированные корпоративные Email-адреса, собранные непосредственно с их сайтов (проверены на валидность)
- Ссылки на социальные сети (Facebook, Instagram, LinkedIn)

Всего в базе 110 уникальных строк (филиалы одной сети разделены по уникальным URL Maps, дубликаты удалены).

Форматы выгрузки (вы получаете весь архив):
1. Excel (.xls) — с правильным числовым форматом рейтинга (рейтинг 4.8 сохранен как число, а не дата "08.апр").
2. HTML Dashboard — премиальная интерактивная веб-панель с поиском, статистикой и фильтрами.
3. CSV, JSON, Markdown, TSV, XML.

Кому подойдет база:
Маркетологам, digital-агентствам, разработчикам сайтов, IT-компаниям и всем, кто хочет продавать свои услуги (реклама, лиды, софт, дизайн) агентствам недвижимости в Дубае. Реальные контакты лиц, принимающих решения.`,
        instructions: `После покупки вы моментально получите ZIP-архив, содержащий базу во всех 7 форматах: leads.xls, leads.html, leads.csv, leads.json, leads.md, leads.tsv, leads.xml. 
Если вам удобнее получить файлы на почту или в Telegram, напишите ваши контакты в чате.`
    },
    en: {
        title: '110 Verified Dubai Real Estate Agencies B2B Database (Emails & Phones)',
        description: `Freshly compiled and verified database of 110 active Real Estate Agencies in Dubai (covering Marina, Downtown, and JBR areas).

Database fields:
- Company Name
- Website URL
- Google Maps Rating & Review Count (extracted using stealth mode)
- Direct Phone Numbers
- Verified Corporate Emails (crawled directly from their websites)
- Social Media Links (Facebook, Instagram, LinkedIn)

Format deliverables (you receive the complete ZIP archive):
1. Excel (.xls) - formatted cell types, no rating-to-date conversion bugs.
2. HTML Dashboard - premium interactive search dashboard with filter metrics.
3. CSV, JSON, Markdown, TSV, XML files.

Ideal for:
Digital marketing agencies, web developers, software companies, and anyone looking to pitch services to real estate firms in the UAE.`,
        instructions: `Once purchased, you will receive a ZIP file containing the database in all 7 formats (leads.xls, leads.html, leads.csv, leads.json, leads.md, leads.tsv, leads.xml). 
Let me know if you need it sent to a specific email address or telegram.`
    }
};

async function injectWidget(page) {
    try {
        await page.evaluate((texts) => {
            if (document.getElementById('krnl-helper-widget')) return;

            const widget = document.createElement('div');
            widget.id = 'krnl-helper-widget';
            widget.style.position = 'fixed';
            widget.style.bottom = '20px';
            widget.style.right = '20px';
            widget.style.width = '280px';
            widget.style.backgroundColor = 'rgba(15, 15, 20, 0.96)';
            widget.style.border = '2px solid #00f0ff';
            widget.style.borderRadius = '12px';
            widget.style.boxShadow = '0 0 20px rgba(0, 240, 255, 0.4)';
            widget.style.padding = '12px';
            widget.style.zIndex = '9999999';
            widget.style.fontFamily = 'Segoe UI, Arial, sans-serif';
            widget.style.color = '#fff';
            widget.style.userSelect = 'none';

            widget.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 8px; color: #00f0ff; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #222; padding-bottom: 6px;">
                    <span style="display: flex; align-items: center; gap: 5px;">⚡ KRNL Co-Pilot</span>
                    <button onclick="document.getElementById('krnl-helper-widget').remove()" style="background: none; border: none; color: #ff0055; cursor: pointer; font-size: 18px; font-weight: bold;">×</button>
                </div>
                <div style="font-size: 11px; color: #888; margin-bottom: 10px; line-height: 1.3;">
                    1. Кликни в поле ввода на сайте<br>
                    2. Нажми нужную кнопку ниже:
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <button id="btn-title-ru" style="background: #111520; border: 1px solid #00f0ff33; color: #00f0ff; padding: 6px 10px; border-radius: 6px; cursor: pointer; text-align: left; font-size: 12px; transition: 0.2s;">✍️ Заголовок (RU)</button>
                    <button id="btn-desc-ru" style="background: #111520; border: 1px solid #00f0ff33; color: #00f0ff; padding: 6px 10px; border-radius: 6px; cursor: pointer; text-align: left; font-size: 12px; transition: 0.2s;">📝 Описание (RU)</button>
                    <button id="btn-inst-ru" style="background: #111520; border: 1px solid #00f0ff33; color: #00f0ff; padding: 6px 10px; border-radius: 6px; cursor: pointer; text-align: left; font-size: 12px; transition: 0.2s;">📦 Инструкция (RU)</button>
                    
                    <div style="height: 1px; background: #333; margin: 4px 0;"></div>
                    
                    <button id="btn-title-en" style="background: #1a1120; border: 1px solid #d400ff33; color: #d400ff; padding: 6px 10px; border-radius: 6px; cursor: pointer; text-align: left; font-size: 12px; transition: 0.2s;">✍️ Title (EN)</button>
                    <button id="btn-desc-en" style="background: #1a1120; border: 1px solid #d400ff33; color: #d400ff; padding: 6px 10px; border-radius: 6px; cursor: pointer; text-align: left; font-size: 12px; transition: 0.2s;">📝 Description (EN)</button>
                    <button id="btn-inst-en" style="background: #1a1120; border: 1px solid #d400ff33; color: #d400ff; padding: 6px 10px; border-radius: 6px; cursor: pointer; text-align: left; font-size: 12px; transition: 0.2s;">📦 Instructions (EN)</button>
                </div>
                <div style="margin-top: 10px; font-size: 10px; text-align: center; color: #444; border-top: 1px solid #222; padding-top: 6px;">
                    KRNL Systems v1.2
                </div>
            `;

            document.body.appendChild(widget);

            // Стили для наведения на кнопки
            const buttons = widget.querySelectorAll('button');
            buttons.forEach(btn => {
                if (btn.id) {
                    btn.onmouseover = () => { btn.style.background = '#1a2235'; btn.style.transform = 'translateX(2px)'; };
                    btn.onmouseout = () => { btn.style.background = btn.id.includes('ru') ? '#111520' : '#1a1120'; btn.style.transform = 'none'; };
                }
            });

            // Функция ввода текста
            const fillText = (text) => {
                const active = document.activeElement;
                if (!active || active === document.body) {
                    alert('⚠️ Сначала кликните мышкой в нужное поле ввода на сайте!');
                    return;
                }

                // Эмуляция ввода для визуальных редакторов
                if (active.classList.contains('trumbowyg-editor') || active.getAttribute('contenteditable') === 'true') {
                    active.innerHTML = text.replace(/\n/g, '<br>');
                    active.dispatchEvent(new Event('input', { bubbles: true }));
                    return;
                }

                // Стандартное поле ввода или textarea
                active.value = text;
                active.dispatchEvent(new Event('input', { bubbles: true }));
                active.dispatchEvent(new Event('change', { bubbles: true }));
            };

            document.getElementById('btn-title-ru').onclick = () => fillText(texts.ru.title);
            document.getElementById('btn-desc-ru').onclick = () => fillText(texts.ru.description);
            document.getElementById('btn-inst-ru').onclick = () => fillText(texts.ru.instructions);
            
            document.getElementById('btn-title-en').onclick = () => fillText(texts.en.title);
            document.getElementById('btn-desc-en').onclick = () => fillText(texts.en.description);
            document.getElementById('btn-inst-en').onclick = () => fillText(texts.en.instructions);
        }, TEXTS);
    } catch (e) {
        // Игнорируем ошибки инъекции на технических/пустых страницах
    }
}

async function start() {
    console.log('\x1B[2J\x1B[3J\x1B[H');
    console.log('\x1b[36m%s\x1b[0m', '┌────────────────────────────────────────────────────────┐');
    console.log('\x1b[36m%s\x1b[0m', '│           ⚡ KRNL SALES CO-PILOT AGENT ACTIVE ⚡        │');
    console.log('\x1b[36m%s\x1b[0m', '└────────────────────────────────────────────────────────┘');
    console.log('  Инициализация сессии...');

    const userDataDir = path.join(__dirname, 'user_data');
    
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: null,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--start-maximized'
        ],
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    // Скрываем признаки автоматизации
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
    });

    // Открываем Kwork и Funpay на старте
    const page1 = await context.newPage();
    await page1.goto('https://kwork.ru', { waitUntil: 'domcontentloaded' });
    
    const page2 = await context.newPage();
    await page2.goto('https://funpay.com', { waitUntil: 'domcontentloaded' });

    // Закрываем пустую вкладку, если осталась
    const pages = context.pages();
    if (pages[0] && pages[0].url() === 'about:blank') {
        await pages[0].close().catch(() => {});
    }

    console.log('\n\x1b[32m%s\x1b[0m', '  ✓ Браузер открыт! Две вкладки (Kwork и FunPay) запущены.');
    console.log('  👉 Войдите в свои аккаунты вручную в окне браузера.');
    console.log('  👉 При переходе на страницу создания объявления там появится синий виджет "KRNL Co-Pilot".');
    console.log('  👉 Кликните в нужное поле на сайте и нажмите кнопку на виджете — данные введутся сами.');
    console.log('\n  Бот также отслеживает входящие сообщения на вкладках...');

    // Авто-инъекция виджета при навигации и отслеживание заголовков
    context.on('page', async (page) => {
        page.on('framenavigated', async (frame) => {
            if (frame === page.mainFrame()) {
                await page.waitForTimeout(1000);
                await injectWidget(page);
            }
        });
    });

    // Установка слушателя на уже открытые страницы
    for (const page of context.pages()) {
        page.on('framenavigated', async (frame) => {
            if (frame === page.mainFrame()) {
                await page.waitForTimeout(1000);
                await injectWidget(page);
            }
        });
        // Разово инжектим на стартовые страницы
        await injectWidget(page);
    }

    // Фоновый цикл проверки уведомлений каждые 20 секунд
    setInterval(async () => {
        try {
            const activePages = context.pages();
            for (const p of activePages) {
                const title = await p.title().catch(() => '');
                const url = p.url();
                
                // Проверяем наличие уведомлений в заголовке вкладки
                const match = title.match(/\((\d+)\)/);
                if (match) {
                    const count = match[1];
                    process.stdout.write('\x07'); // Звуковой сигнал
                    console.log(`\n\x1b[33m🔔 [НОВОЕ СООБЩЕНИЕ] Обнаружено (${count}) уведомление на странице: "${title}"\x1b[0m`);
                    console.log(`   Ссылка: ${url}`);
                }
            }
        } catch (e) {}
    }, 20000);
}

start().catch(err => {
    console.error('Ошибка старта ко-пилота:', err);
});
