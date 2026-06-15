const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PORT = 9223;
const SCREENSHOT_PATH = path.join(__dirname, 'agent-screenshot.png');

// Вспомогательная функция для получения активной страницы
async function getActivePage(browser) {
    const contexts = browser.contexts();
    if (contexts.length === 0) return null;
    
    const context = contexts[0];
    const pages = context.pages();
    if (pages.length === 0) return null;
    
    // Ищем ту страницу, которая не скрыта
    for (const p of pages) {
        const isHidden = await p.evaluate(() => document.hidden).catch(() => true);
        if (!isHidden) return p;
    }
    return pages[0]; // Возвращаем первую, если все скрыты
}

// Извлечение интерактивных элементов со страницы
async function getInteractiveElements(page) {
    return await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('input, textarea, select, button, a, [role="button"], [contenteditable="true"]'));
        
        return elements.map((el, index) => {
            const rect = el.getBoundingClientRect();
            // Проверяем видимость элемента
            const isVisible = rect.width > 0 && rect.height > 0 && 
                              window.getComputedStyle(el).display !== 'none' && 
                              window.getComputedStyle(el).visibility !== 'hidden';
            
            if (!isVisible) return null;

            // Генерируем простой селектор
            let selector = el.tagName.toLowerCase();
            if (el.id) {
                selector += `#${el.id}`;
            } else if (el.name) {
                selector += `[name="${el.name}"]`;
            } else if (el.className) {
                const classes = Array.from(el.classList).filter(c => !c.includes('hover') && !c.includes('active')).join('.');
                if (classes) selector += `.${classes}`;
            }

            // Текстовое содержимое
            let text = el.innerText || el.value || el.placeholder || '';
            text = text.trim().substring(0, 100);

            return {
                index,
                tag: el.tagName,
                type: el.type || null,
                name: el.name || null,
                placeholder: el.placeholder || null,
                text,
                selector,
                isContentEditable: el.getAttribute('contenteditable') === 'true'
            };
        }).filter(e => e !== null);
    });
}

async function run() {
    const args = process.argv.slice(2);
    const actionArg = args.indexOf('--action');
    const action = actionArg !== -1 ? args[actionArg + 1] : 'state';

    const selectorArg = args.indexOf('--selector');
    const selector = selectorArg !== -1 ? args[selectorArg + 1] : null;

    const textArg = args.indexOf('--text');
    const text = textArg !== -1 ? args[textArg + 1] : null;

    const urlArg = args.indexOf('--url');
    const url = urlArg !== -1 ? args[urlArg + 1] : null;

    if (action === 'launch') {
        console.log('🚀 Запуск Chrome в режиме удаленной отладки...');
        const userDataDir = path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data');
        
        try {
            // Запускаем инстанс Chrome
            const context = await chromium.launchPersistentContext(userDataDir, {
                channel: 'chrome',
                headless: false,
                viewport: null,
                args: [
                    `--remote-debugging-port=${PORT}`,
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--start-maximized',
                    '--profile-directory=Profile 3'
                ]
            });

            // Открываем вкладки Kwork и Funpay по умолчанию
            const pages = context.pages();
            const page = pages.length > 0 ? pages[0] : await context.newPage();
            await page.goto('https://kwork.ru', { waitUntil: 'domcontentloaded' }).catch(() => {});
            
            const page2 = await context.newPage();
            await page2.goto('https://funpay.com', { waitUntil: 'domcontentloaded' }).catch(() => {});

            console.log(`🌐 Chrome успешно запущен. Порт отладки: ${PORT}`);
            console.log('Оставляю процесс активным...');
            
            // Держим процесс открытым
            await new Promise(() => {});
        } catch (e) {
            console.error('❌ Ошибка запуска Chrome:', e.message);
            process.exit(1);
        }
    }

    // Подключаемся к запущенному Chrome по CDP
    let browser;
    try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
    } catch (e) {
        console.error(`❌ Не удалось подключиться к Chrome на порту ${PORT}. Убедитесь, что Chrome запущен командой "launch".`);
        process.exit(1);
    }

    const page = await getActivePage(browser);
    if (!page) {
        console.error('❌ Нет активных страниц в браузере.');
        await browser.close().catch(() => {});
        process.exit(1);
    }

    try {
        switch (action) {
            case 'state': {
                console.log(`\n🌐 Активная страница: ${page.url()}`);
                console.log(`🏷️ Заголовок страницы: ${await page.title()}`);
                
                // Снимок экрана с таймаутом 5с
                await page.screenshot({ path: SCREENSHOT_PATH, timeout: 5000 }).catch(() => {});
                console.log(`📸 Снимок экрана сохранен в: ${SCREENSHOT_PATH}`);

                // Интерактивные элементы
                const elements = await getInteractiveElements(page);
                console.log('\n🎯 Доступные интерактивные элементы:');
                console.log(JSON.stringify(elements, null, 2));
                break;
            }

            case 'goto': {
                if (!url) throw new Error('Параметр --url обязателен для действия goto');
                console.log(`🌐 Перехожу на: ${url}...`);
                await page.goto(url, { waitUntil: 'domcontentloaded' });
                console.log('✓ Переход выполнен.');
                break;
            }

            case 'click': {
                if (!selector) throw new Error('Параметр --selector обязателен для действия click');
                console.log(`🖱️ Кликаю по элементу: ${selector}...`);
                
                const element = page.locator(selector).first();
                await element.click({ timeout: 5000 });
                await page.waitForTimeout(2000); // Даем странице обновиться
                console.log('✓ Клик выполнен.');
                break;
            }

            case 'type': {
                if (!selector || !text) throw new Error('Параметры --selector и --text обязательны для действия type');
                console.log(`✍️ Ввожу текст в: ${selector}...`);
                
                const element = page.locator(selector).first();
                await element.focus();
                
                // Очищаем существующий текст
                await page.keyboard.press('Control+A');
                await page.keyboard.press('Backspace');

                // Печатаем с задержками
                for (const char of text) {
                    await page.keyboard.type(char, { delay: 10 + Math.random() * 20 });
                }
                
                console.log('✓ Текст введен.');
                break;
            }

            case 'select': {
                if (!selector || !text) throw new Error('Параметры --selector и --text обязательны для действия select');
                console.log(`🔀 Выбираю опцию в ${selector} по значению: ${text}...`);
                const element = page.locator(selector).first();
                await element.selectOption({ label: text });
                await page.waitForTimeout(1000);
                console.log('✓ Опция выбрана.');
                break;
            }

            case 'eval': {
                if (!text) throw new Error('Параметр --text (код js) обязателен для действия eval');
                console.log('⚙️ Выполняю JavaScript код на странице...');
                const result = await page.evaluate(text);
                console.log('Результат выполнения:', result);
                break;
            }

            default:
                console.error(`❌ Неизвестное действие: ${action}`);
        }
    } catch (err) {
        console.error('❌ Ошибка выполнения действия:', err.message);
    } finally {
        await browser.close().catch(() => {});
    }
}

run();
