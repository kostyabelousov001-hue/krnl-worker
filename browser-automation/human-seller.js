const { chromium } = require('playwright');
const path = require('path');
const readline = require('readline');

// Адрес кошелька для монетизации
const TON_WALLET = 'UQDvz0Bh8hx88bBFPI-JV2xfGAubFngPaDBrl8ldHRHiJOU4';

// Шаблоны текстов для продажи базы
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

let browserContext = null;
let alertInterval = null;
let alertActive = false;

// Инициализация readline для перехвата клавиш
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
}

// Рендеринг интерфейса
function renderMenu() {
    process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
    
    const bold = '\x1b[1m';
    const cyan = '\x1b[36m';
    const green = '\x1b[32m';
    const yellow = '\x1b[33m';
    const magenta = '\x1b[35m';
    const red = '\x1b[31m';
    const reset = '\x1b[0m';
    const gray = '\x1b[90m';
    
    const w = 90;
    console.log(`${cyan}┌${'─'.repeat(w - 2)}┐${reset}`);
    console.log(`${cyan}│${reset}${bold}${green}                  🤖 HUMAN-LIKE B2B SALES CO-PILOT (KWORK / FUNPAY)                    ${cyan}│${reset}`);
    console.log(`${cyan}└${'─'.repeat(w - 2)}┘${reset}`);
    
    console.log(`  ${bold}Статус браузера:${reset} ${browserContext ? `${green}Запущен (Headed, Stealth) ✓${reset}` : `${red}Выключен${reset}`}`);
    console.log(`  ${bold}Авто-оповещения о сообщениях:${reset} ${alertActive ? `${green}АКТИВНЫ (каждые 30 сек)${reset}` : `${gray}Отключены${reset}`}`);
    console.log(`  ${bold}Ваш TON Кошелек:${reset} ${magenta}${TON_WALLET}${reset}`);
    console.log(`${cyan}  ${'─'.repeat(w - 4)}${reset}`);
    
    console.log(`  ${bold}БРАУЗЕР И НАВИГАЦИЯ:${reset}`);
    console.log(`    [O] - Открыть Kwork (ru)            [P] - Открыть FunPay (ru)`);
    console.log(`    [M] - Переключить авто-оповещения о сообщениях (опрос вкладок)`);
    console.log(`${cyan}  ${'─'.repeat(w - 4)}${reset}`);
    
    console.log(`  ${bold}УМНЫЙ ЧЕЛОВЕКОПОДОБНЫЙ ВВОД (в сфокусированное поле браузера):${reset}`);
    console.log(`    Нажми клавишу, чтобы бот напечатал текст в выбранное поле на странице:`);
    console.log(`    ${yellow}[1]${reset} - Напечатать ${bold}RU заголовок${reset}`);
    console.log(`    ${yellow}[2]${reset} - Напечатать ${bold}RU описание (очень подробно)${reset}`);
    console.log(`    ${yellow}[3]${reset} - Напечатать ${bold}RU инструкцию покупателю${reset}`);
    console.log(`    ${yellow}[4]${reset} - Напечатать ${bold}EN заголовок${reset}`);
    console.log(`    ${yellow}[5]${reset} - Напечатать ${bold}EN описание${reset}`);
    console.log(`    ${yellow}[6]${reset} - Напечатать ${bold}EN инструкцию покупателю${reset}`);
    console.log(`${cyan}  ${'─'.repeat(w - 4)}${reset}`);
    
    console.log(`  ${bold}УПРАВЛЕНИЕ:${reset}`);
    console.log(`    [R] - Перерисовать это меню         [Q] - Выйти из программы и закрыть браузер`);
    console.log(`${cyan}└${'─'.repeat(w - 2)}┘${reset}`);
    console.log(`\n  👉 ${bold}Инструкция:${reset} Нажмите [O] или [P], чтобы открыть сайт. Войдите в аккаунт вручную.`);
    console.log(`  Затем на странице создания объявления кликните мышкой на нужное поле ввода,`);
    console.log(`  вернитесь в эту консоль и нажмите цифру от 1 до 6. Бот сам напечатает текст с задержками.`);
}

// Запуск браузера
async function launchBrowser() {
    if (browserContext) return;
    
    console.log('\n🚀 Запуск Chromium с чистым профилем и обходом систем детекции...');
    const userDataDir = path.join(__dirname, 'user_data');
    
    try {
        browserContext = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            viewport: null, // Открывать на весь доступный экран
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--start-maximized'
            ],
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        
        // Скрываем navigator.webdriver на уровне инициализации страниц
        await browserContext.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        });
        
        console.log('✅ Браузер успешно запущен!');
        renderMenu();
    } catch (e) {
        console.log(`❌ Ошибка запуска браузера: ${e.message}`);
    }
}

// Печать текста с человеческими задержками
async function typeToActiveElement(text) {
    if (!browserContext) {
        console.log('\n⚠️  Сначала запустите браузер (нажмите O или P)!');
        return;
    }
    
    console.log('\n✍️ Печатаю текст в активное поле на странице...');
    try {
        const pages = browserContext.pages();
        if (pages.length === 0) {
            console.log('⚠️  Нет открытых вкладок!');
            return;
        }
        
        // Находим активную страницу
        let activePage = pages[0];
        // Ищем ту, которая сейчас на виду (активная)
        for (const p of pages) {
            const isHidden = await p.evaluate(() => document.hidden).catch(() => true);
            if (!isHidden) {
                activePage = p;
                break;
            }
        }
        
        // Фокусируемся на странице
        await activePage.bringToFront();
        
        // Печатаем текст символ за символом с случайными задержками
        for (const char of text) {
            await activePage.keyboard.type(char, { delay: 15 + Math.random() * 25 });
        }
        console.log('✅ Печать завершена успешно!');
    } catch (e) {
        console.log(`❌ Ошибка при вводе: ${e.message}`);
    }
}

// Переход по URL
async function navigateTo(url) {
    await launchBrowser();
    try {
        const pages = browserContext.pages();
        const page = pages.length > 0 ? pages[0] : await browserContext.newPage();
        await page.bringToFront();
        console.log(`\n🌐 Перехожу на: ${url}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded' });
    } catch (e) {
        console.log(`❌ Ошибка навигации: ${e.message}`);
    }
}

// Проверка входящих сообщений по заголовкам вкладок
async function checkUnreadMessages() {
    if (!browserContext) return;
    try {
        const pages = browserContext.pages();
        for (const page of pages) {
            const title = await page.title().catch(() => '');
            const url = page.url();
            
            // Если в заголовке есть цифра в скобках (например, (1) Диалоги или (2) Сообщения)
            const match = title.match(/\((\d+)\)/);
            if (match) {
                const count = match[1];
                // Сигнал
                process.stdout.write('\x07');
                console.log(`\n🔔 [ОПОВЕЩЕНИЕ]: Обнаружено (${count}) новых уведомлений/сообщений!`);
                console.log(`   Страница: "${title}"`);
                console.log(`   Ссылка: ${url}`);
            }
        }
    } catch (e) {
        // Игнорируем ошибки опроса
    }
}

// Включение/выключение автоопроса сообщений
function toggleAlerts() {
    alertActive = !alertActive;
    if (alertActive) {
        alertInterval = setInterval(checkUnreadMessages, 30000);
        console.log('\n🔔 Авто-оповещения включены (интервал 30 секунд).');
    } else {
        if (alertInterval) clearInterval(alertInterval);
        console.log('\n🔕 Авто-оповещения отключены.');
    }
    renderMenu();
}

// Главный обработчик ввода
process.stdin.on('keypress', async (str, key) => {
    // Выход по Ctrl+C или Q
    if (key.ctrl && key.name === 'c') {
        cleanup();
        process.exit();
    }
    
    const char = key.sequence.toLowerCase();
    
    switch (char) {
        case 'q':
            await cleanup();
            process.exit();
            break;
        case 'r':
            renderMenu();
            break;
        case 'o':
            await navigateTo('https://kwork.ru');
            renderMenu();
            break;
        case 'p':
            await navigateTo('https://funpay.com');
            renderMenu();
            break;
        case 'm':
            toggleAlerts();
            break;
        case '1':
            await typeToActiveElement(TEXTS.ru.title);
            break;
        case '2':
            await typeToActiveElement(TEXTS.ru.description);
            break;
        case '3':
            await typeToActiveElement(TEXTS.ru.instructions);
            break;
        case '4':
            await typeToActiveElement(TEXTS.en.title);
            break;
        case '5':
            await typeToActiveElement(TEXTS.en.description);
            break;
        case '6':
            await typeToActiveElement(TEXTS.en.instructions);
            break;
    }
});

async function cleanup() {
    if (alertInterval) clearInterval(alertInterval);
    if (browserContext) {
        console.log('\n🔌 Закрываю браузер...');
        await browserContext.close().catch(() => {});
        browserContext = null;
    }
}

// Запуск программы
renderMenu();
