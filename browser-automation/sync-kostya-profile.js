const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

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
    }
};

// Вспомогательная функция для копирования папок рекурсивно
function copyFolderSync(from, to) {
    if (!fs.existsSync(from)) return;
    if (!fs.existsSync(to)) {
        fs.mkdirSync(to, { recursive: true });
    }
    
    fs.readdirSync(from).forEach(element => {
        const fromPath = path.join(from, element);
        const toPath = path.join(to, element);
        
        if (fs.lstatSync(fromPath).isDirectory()) {
            copyFolderSync(fromPath, toPath);
        } else {
            try {
                fs.copyFileSync(fromPath, toPath);
            } catch (e) {
                // Игнорируем заблокированные файлы
            }
        }
    });
}

function copyProfileData() {
    const srcDir = path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data/Profile 3');
    const destDir = path.join(__dirname, 'user_data_kostya/Default');

    console.log('🔄 Синхронизация профиля Кости...');
    console.log(`Откуда: ${srcDir}`);
    console.log(`Куда: ${destDir}`);

    // Создаем целевую директорию
    fs.mkdirSync(destDir, { recursive: true });

    // Копируем ключевые файлы настроек
    const filesToCopy = ['Preferences', 'Secure Preferences'];
    filesToCopy.forEach(f => {
        const src = path.join(srcDir, f);
        const dest = path.join(destDir, f);
        if (fs.existsSync(src)) {
            try {
                fs.copyFileSync(src, dest);
            } catch (e) {
                console.log(`Не удалось скопировать файл ${f}: ${e.message}`);
            }
        }
    });

    // Копируем папки Network (куки) и Local Storage
    copyFolderSync(path.join(srcDir, 'Network'), path.join(destDir, 'Network'));
    copyFolderSync(path.join(srcDir, 'Local Storage'), path.join(destDir, 'Local Storage'));
    copyFolderSync(path.join(srcDir, 'Session Storage'), path.join(destDir, 'Session Storage'));

    console.log('✓ Синхронизация завершена.');
}

async function handleKwork(page) {
    const titleSelector = 'textarea.js-title-input, textarea[name="title"], input[name="title"], input[placeholder*="Что вы сделаете" i], textarea[placeholder*="Что вы сделаете" i]';
    try {
        const titleInput = page.locator(titleSelector).first();
        if (await titleInput.count() > 0 && await titleInput.inputValue() === '') {
            console.log('[KWORK] ✍️ Заполняю название кворка...');
            await titleInput.focus();
            await page.keyboard.type(TEXTS.ru.title, { delay: 15 + Math.random() * 20 });
        }
    } catch (e) {}

    const descSelector = '.trumbowyg-editor, textarea[name="description"], textarea[name="content"], textarea.js-description-textarea';
    try {
        const descInput = page.locator(descSelector).first();
        if (await descInput.count() > 0) {
            const isEmpty = await descInput.evaluate(el => el.textContent.trim() === '' && el.value === '');
            if (isEmpty) {
                console.log('[KWORK] ✍️ Заполняю описание кворка...');
                await descInput.focus();
                const isEditable = await descInput.getAttribute('contenteditable');
                if (isEditable === 'true') {
                    await descInput.evaluate((el, text) => {
                        el.innerHTML = text.replace(/\n/g, '<br>');
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                    }, TEXTS.ru.description);
                } else {
                    await page.keyboard.type(TEXTS.ru.description, { delay: 5 + Math.random() * 10 });
                }
            }
        }
    } catch (e) {}

    const instSelector = 'textarea[name="instruction"], textarea.js-instruction-textarea, textarea[placeholder*="инструкция" i]';
    try {
        const instInput = page.locator(instSelector).first();
        if (await instInput.count() > 0 && await instInput.inputValue() === '') {
            console.log('[KWORK] ✍️ Заполняю инструкцию покупателю...');
            await instInput.focus();
            await page.keyboard.type(TEXTS.ru.instructions, { delay: 15 + Math.random() * 20 });
        }
    } catch (e) {}

    const priceSelector = 'input[name="price"], input.js-price-input';
    try {
        const priceInput = page.locator(priceSelector).first();
        if (await priceInput.count() > 0 && await priceInput.inputValue() === '') {
            console.log('[KWORK] ✍️ Заполняю стоимость кворка (500 руб)...');
            await priceInput.focus();
            await page.keyboard.type('500', { delay: 50 });
        }
    } catch (e) {}
}

async function handleFunpay(page) {
    const shortDescSelector = 'input[name*="desc" i], input[placeholder*="описание лота" i]';
    try {
        const shortInput = page.locator(shortDescSelector).first();
        if (await shortInput.count() > 0 && await shortInput.inputValue() === '') {
            console.log('[FUNPAY] ✍️ Заполняю краткое описание лота...');
            await shortInput.focus();
            await page.keyboard.type('База 110 агентств недвижимости Дубая с почтами и телефонами', { delay: 15 + Math.random() * 20 });
        }
    } catch (e) {}

    const fullDescSelector = 'textarea[name*="content" i], textarea[placeholder*="подробное описание" i]';
    try {
        const fullInput = page.locator(fullDescSelector).first();
        if (await fullInput.count() > 0 && await fullInput.inputValue() === '') {
            console.log('[FUNPAY] ✍️ Заполняю подробное описание...');
            await fullInput.focus();
            await page.keyboard.type(TEXTS.ru.description, { delay: 5 + Math.random() * 10 });
        }
    } catch (e) {}

    const priceSelector = 'input[name="price"], input[placeholder*="цена" i]';
    try {
        const priceInput = page.locator(priceSelector).first();
        if (await priceInput.count() > 0 && await priceInput.inputValue() === '') {
            console.log('[FUNPAY] ✍️ Заполняю стоимость лота (500 руб)...');
            await priceInput.focus();
            await page.keyboard.type('500', { delay: 50 });
        }
    } catch (e) {}
}

async function start() {
    console.log('\x1B[2J\x1B[3J\x1B[H');
    console.log('🤖 Инициализация ИИ-Ассистента...');

    // 1. Принудительно закрываем Chrome для освобождения файлов куков
    try {
        console.log('🔌 Завершаю работу Chrome для синхронизации сессии...');
        execSync('taskkill /f /im chrome.exe', { stdio: 'ignore' });
    } catch (e) {}

    // 2. Копируем профиль
    copyProfileData();

    // 3. Запускаем изолированный Chrome
    const userDataDir = path.join(__dirname, 'user_data_kostya');
    console.log(`\n🚀 Запуск Chrome (Сессия Кости) из папки: ${userDataDir}`);

    const context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chrome',
        headless: false,
        viewport: null,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--start-maximized'
        ]
    });

    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
    });

    console.log('\n\x1b[32m%s\x1b[0m', '✓ Браузер открыт под скопированным профилем Кости!');
    console.log('👉 Перехожу к созданию лотов. Твоя сессия должна автоматически подгрузиться.');
    console.log('👉 Робот сам заполнит все поля при открытии форм.');

    const p1 = await context.newPage();
    await p1.goto('https://kwork.ru/create', { waitUntil: 'domcontentloaded' }).catch(() => {});
    
    const p2 = await context.newPage();
    await p2.goto('https://funpay.com/lots/offer/add', { waitUntil: 'domcontentloaded' }).catch(() => {});

    // Закрываем пустую вкладку
    const pages = context.pages();
    if (pages[0] && pages[0].url() === 'about:blank') {
        await pages[0].close().catch(() => {});
    }

    // Фоновый цикл автоматизации полей
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
        } catch (e) {}
    }, 3000);
}

start().catch(err => {
    console.error('Ошибка:', err);
});
