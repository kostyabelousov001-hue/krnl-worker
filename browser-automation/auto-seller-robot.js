const { chromium } = require('playwright');
const path = require('path');

const TON_WALLET = 'UQDvz0Bh8hx88bBFPI-JV2xfGAubFngPaDBrl8ldHRHiJOU4';

// Тексты для продажи
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
    }
};

async function handleKwork(page) {
    console.log('\n[KWORK] 🤖 Робот отслеживает страницу создания кворка...');
    
    // 1. Ждем и заполняем Название на первом шаге
    const titleSelector = 'textarea.js-title-input, textarea[name="title"], input[name="title"], input[placeholder*="Что вы сделаете" i], textarea[placeholder*="Что вы сделаете" i]';
    try {
        const titleInput = page.locator(titleSelector).first();
        if (await titleInput.count() > 0 && await titleInput.inputValue() === '') {
            console.log('[KWORK] ✍️ Заполняю название кворка...');
            await titleInput.focus();
            await page.keyboard.type(TEXTS.ru.title, { delay: 15 + Math.random() * 20 });
            console.log('[KWORK] ✓ Название заполнено.');
        }
    } catch (e) {}

    // 2. Ждем, пока пользователь выберет категорию и нажмет продолжить, чтобы перейти на шаг 2 (Описание)
    // Шаг 2 обычно содержит редактор Trumbowyg или textarea описания
    const descSelector = '.trumbowyg-editor, textarea[name="description"], textarea[name="content"], textarea.js-description-textarea';
    try {
        const descInput = page.locator(descSelector).first();
        if (await descInput.count() > 0) {
            const isEmpty = await descInput.evaluate(el => el.textContent.trim() === '' && el.value === '');
            if (isEmpty) {
                console.log('[KWORK] ✍️ Заполняю описание кворка...');
                await descInput.focus();
                
                // Если это contenteditable div (Trumbowyg)
                const isEditable = await descInput.getAttribute('contenteditable');
                if (isEditable === 'true') {
                    await descInput.evaluate((el, text) => {
                        el.innerHTML = text.replace(/\n/g, '<br>');
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                    }, TEXTS.ru.description);
                } else {
                    await page.keyboard.type(TEXTS.ru.description, { delay: 5 + Math.random() * 10 });
                }
                console.log('[KWORK] ✓ Описание заполнено.');
            }
        }
    } catch (e) {}

    // 3. Заполняем инструкцию покупателю
    const instSelector = 'textarea[name="instruction"], textarea.js-instruction-textarea, textarea[placeholder*="инструкция" i], textarea[placeholder*="требования" i]';
    try {
        const instInput = page.locator(instSelector).first();
        if (await instInput.count() > 0 && await instInput.inputValue() === '') {
            console.log('[KWORK] ✍️ Заполняю инструкцию покупателю...');
            await instInput.focus();
            await page.keyboard.type(TEXTS.ru.instructions, { delay: 15 + Math.random() * 20 });
            console.log('[KWORK] ✓ Инструкция заполнена.');
        }
    } catch (e) {}

    // 4. Заполняем стоимость (если мы на шаге Стоимость)
    const priceSelector = 'input[name="price"], input.js-price-input, input[placeholder*="стоимость" i], input[placeholder*="цена" i]';
    try {
        const priceInput = page.locator(priceSelector).first();
        if (await priceInput.count() > 0 && await priceInput.inputValue() === '') {
            console.log('[KWORK] ✍️ Заполняю стоимость кворка (500 руб)...');
            await priceInput.focus();
            await page.keyboard.type('500', { delay: 50 });
            console.log('[KWORK] ✓ Стоимость заполнена.');
        }
    } catch (e) {}
}

async function handleFunpay(page) {
    console.log('\n[FUNPAY] 🤖 Робот отслеживает страницу добавления лота...');
    
    // Краткое описание лота (обычно input name="desc[ru]" или аналогичные)
    const shortDescSelector = 'input[name*="desc" i], input[placeholder*="краткое описание" i], input[placeholder*="описание лота" i]';
    try {
        const shortInput = page.locator(shortDescSelector).first();
        if (await shortInput.count() > 0 && await shortInput.inputValue() === '') {
            console.log('[FUNPAY] ✍️ Заполняю краткое описание лота...');
            await shortInput.focus();
            await page.keyboard.type('База 110 агентств недвижимости Дубая с почтами и телефонами', { delay: 15 + Math.random() * 20 });
            console.log('[FUNPAY] ✓ Краткое описание заполнено.');
        }
    } catch (e) {}

    // Подробное описание лота
    const fullDescSelector = 'textarea[name*="content" i], textarea[name*="desc" i], textarea[placeholder*="подробное описание" i]';
    try {
        const fullInput = page.locator(fullDescSelector).first();
        if (await fullInput.count() > 0 && await fullInput.inputValue() === '') {
            console.log('[FUNPAY] ✍️ Заполняю подробное описание...');
            await fullInput.focus();
            await page.keyboard.type(TEXTS.ru.description, { delay: 5 + Math.random() * 10 });
            console.log('[FUNPAY] ✓ Подробное описание заполнено.');
        }
    } catch (e) {}

    // Цена лота
    const priceSelector = 'input[name="price"], input[placeholder*="цена" i], input[placeholder*="руб" i]';
    try {
        const priceInput = page.locator(priceSelector).first();
        if (await priceInput.count() > 0 && await priceInput.inputValue() === '') {
            console.log('[FUNPAY] ✍️ Заполняю стоимость лота (500 руб)...');
            await priceInput.focus();
            await page.keyboard.type('500', { delay: 50 });
            console.log('[FUNPAY] ✓ Стоимость заполнена.');
        }
    } catch (e) {}
}

async function start() {
    console.log('\x1B[2J\x1B[3J\x1B[H');
    console.log('\x1b[36m%s\x1b[0m', '┌────────────────────────────────────────────────────────┐');
    console.log('\x1b[36m%s\x1b[0m', '│          🤖 KRNL AUTOMATIC SALES ROBOT ACTIVE 🤖       │');
    console.log('\x1b[36m%s\x1b[0m', '└────────────────────────────────────────────────────────┘');
    console.log('  Инициализация выделенного профиля Chrome...');
    const userDataDir = path.join(__dirname, 'user_data');
    console.log(`  Директория профиля: ${userDataDir}`);

    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: null,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--start-maximized'
        ]
    });

    // Скрываем признаки автоматизации
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
    });

    console.log('\n\x1b[32m%s\x1b[0m', '  ✓ Браузер открыт!');
    console.log('  👉 Перехожу на Kwork и FunPay. Если сессия загрузилась из Chrome, вы сразу будете авторизованы.');
    console.log('  👉 Робот сам заполнит поля "Название", "Описание", "Цена" и "Инструкции", как только вы зайдете на страницу создания лота.');
    console.log('  👉 Вам останется только нажать кнопку публикации.');

    const page1 = await context.newPage();
    console.log('🌐 Перехожу на Kwork...');
    await page1.goto('https://kwork.ru/create', { waitUntil: 'domcontentloaded' }).catch(() => {});
    
    const page2 = await context.newPage();
    console.log('🌐 Перехожу на FunPay...');
    await page2.goto('https://funpay.com/lots/offer/add', { waitUntil: 'domcontentloaded' }).catch(() => {});

    // Закрываем пустую вкладку
    const pages = context.pages();
    if (pages[0] && pages[0].url() === 'about:blank') {
        await pages[0].close().catch(() => {});
    }

    // Основной цикл автоматизации
    setInterval(async () => {
        try {
            const activePages = context.pages();
            for (const p of activePages) {
                const url = p.url();
                if (url.includes('kwork.ru') || url.includes('kwork.com')) {
                    await handleKwork(p);
                } else if (url.includes('funpay.com') || url.includes('funpay.ru')) {
                    await handleFunpay(p);
                }
            }
        } catch (e) {
            // Игнорируем временные ошибки
        }
    }, 3000);
}

start().catch(err => {
    console.error('Ошибка работы робота:', err);
});
