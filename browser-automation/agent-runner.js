const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const COMMAND_FILE = path.join(__dirname, 'agent-command.json');
const RESPONSE_FILE = path.join(__dirname, 'agent-response.json');
const SCREENSHOT_PATH = path.join(__dirname, 'agent-screenshot.png');

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

function syncKostyaProfile() {
    const srcDir = path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data/Profile 3');
    const destDir = path.join(__dirname, 'user_data_kostya/Default');
    const localStateSrc = path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data/Local State');
    const localStateDest = path.join(__dirname, 'user_data_kostya/Local State');

    console.log('🔄 Синхронизация профиля Кости (куки и ключи шифрования)...');
    
    // Создаем целевую директорию
    fs.mkdirSync(destDir, { recursive: true });

    // 1. Копируем Local State (важно для DPAPI-дешифрования куков!)
    if (fs.existsSync(localStateSrc)) {
        try {
            fs.copyFileSync(localStateSrc, localStateDest);
            console.log('✓ Файл Local State перенесен.');
        } catch (e) {
            console.warn('⚠️ Ошибка копирования Local State:', e.message);
        }
    }

    // 2. Копируем Preferences и Secure Preferences
    const filesToCopy = ['Preferences', 'Secure Preferences'];
    filesToCopy.forEach(f => {
        const src = path.join(srcDir, f);
        const dest = path.join(destDir, f);
        if (fs.existsSync(src)) {
            try {
                fs.copyFileSync(src, dest);
            } catch (e) {}
        }
    });

    // 3. Копируем куки и локальное хранилище
    copyFolderSync(path.join(srcDir, 'Network'), path.join(destDir, 'Network'));
    copyFolderSync(path.join(srcDir, 'Local Storage'), path.join(destDir, 'Local Storage'));
    copyFolderSync(path.join(srcDir, 'Session Storage'), path.join(destDir, 'Session Storage'));

    console.log('✓ Профиль успешно синхронизирован.');
}

async function getInteractiveElements(page) {
    try {
        return await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('input, textarea, select, button, a, [role="button"], [contenteditable="true"]'));
            
            return elements.map((el, index) => {
                const rect = el.getBoundingClientRect();
                const isVisible = rect.width > 0 && rect.height > 0 && 
                                  window.getComputedStyle(el).display !== 'none' && 
                                  window.getComputedStyle(el).visibility !== 'hidden';
                
                if (!isVisible) return null;

                let selector = el.tagName.toLowerCase();
                if (el.id) {
                    selector += `#${el.id}`;
                } else if (el.name) {
                    selector += `[name="${el.name}"]`;
                } else if (el.className) {
                    const classes = Array.from(el.classList).filter(c => !c.includes('hover') && !c.includes('active') && !c.includes('focus')).join('.');
                    if (classes) selector += `.${classes}`;
                }

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
    } catch (e) {
        return [];
    }
}

async function getActivePage(context) {
    const pages = context.pages();
    if (pages.length === 0) return null;
    for (const p of pages) {
        const isHidden = await p.evaluate(() => document.hidden).catch(() => true);
        if (!isHidden) return p;
    }
    return pages[0];
}

async function writeResponse(data) {
    fs.writeFileSync(RESPONSE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

async function start() {
    console.log('\x1B[2J\x1B[3J\x1B[H');
    console.log('🤖 Инициализация ИИ-Агента (Кооптированный режим)...');
    
    // Чистим старые файлы
    if (fs.existsSync(COMMAND_FILE)) fs.unlinkSync(COMMAND_FILE);
    if (fs.existsSync(RESPONSE_FILE)) fs.unlinkSync(RESPONSE_FILE);

    // Закрываем основной Chrome для синхронизации без ошибок доступа
    try {
        console.log('🔌 Завершаю работу Chrome для разблокировки файлов...');
        execSync('taskkill /f /im chrome.exe', { stdio: 'ignore' });
    } catch (e) {}

    // Синхронизируем сессию Кости с учетом ключей шифрования
    syncKostyaProfile();

    const userDataDir = path.join(__dirname, 'user_data_kostya');
    console.log(`🚀 Запуск Chrome (Копия профиля Кости): ${userDataDir}`);

    let context;
    try {
        context = await chromium.launchPersistentContext(userDataDir, {
            channel: 'chrome',
            headless: false,
            viewport: null,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--start-maximized'
            ]
        });
    } catch (e) {
        console.error('❌ Ошибка запуска Chrome:', e.message);
        process.exit(1);
    }

    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
    });

    console.log('\n✓ Браузер открыт под профилем Кости (сессия активна).');
    console.log('📥 Ожидаю команд от ИИ-Агента в файле agent-command.json...');

    // Открываем Kwork и Funpay
    const p1 = await context.newPage();
    await p1.goto('https://kwork.ru/create', { waitUntil: 'domcontentloaded' }).catch(() => {});
    
    const p2 = await context.newPage();
    await p2.goto('https://funpay.com/lots/offer/add', { waitUntil: 'domcontentloaded' }).catch(() => {});

    // Закрываем пустую
    const pages = context.pages();
    if (pages[0] && pages[0].url() === 'about:blank') {
        await pages[0].close().catch(() => {});
    }

    // Делаем первый снимок состояния стартовой страницы
    const activePage = await getActivePage(context);
    if (activePage) {
        await activePage.screenshot({ path: SCREENSHOT_PATH, timeout: 5000 }).catch(() => {});
        const elements = await getInteractiveElements(activePage);
        await writeResponse({
            status: 'initialized',
            url: activePage.url(),
            title: await activePage.title(),
            elements,
            screenshot: SCREENSHOT_PATH
        });
        console.log('✓ Начальное состояние записано.');
    }

    // Слушаем команды
    while (true) {
        if (fs.existsSync(COMMAND_FILE)) {
            try {
                const cmdContent = fs.readFileSync(COMMAND_FILE, 'utf8');
                const cmd = JSON.parse(cmdContent);
                console.log(`\n📥 Получена команда: ${cmd.action}`);

                const page = await getActivePage(context);
                if (!page) {
                    await writeResponse({ status: 'error', message: 'No active pages found' });
                    fs.unlinkSync(COMMAND_FILE);
                    continue;
                }

                let result = { status: 'success' };

                switch (cmd.action) {
                    case 'state': {
                        break;
                    }
                    case 'goto': {
                        await page.goto(cmd.url, { waitUntil: 'domcontentloaded' });
                        break;
                    }
                    case 'click': {
                        const element = page.locator(cmd.selector).first();
                        await element.click({ timeout: 5000 });
                        await page.waitForTimeout(2000);
                        break;
                    }
                    case 'type': {
                        const element = page.locator(cmd.selector).first();
                        await element.focus();
                        await page.keyboard.press('Control+A');
                        await page.keyboard.press('Backspace');
                        for (const char of cmd.text) {
                            await page.keyboard.type(char, { delay: 10 + Math.random() * 20 });
                        }
                        break;
                    }
                    case 'eval': {
                        const evalRes = await page.evaluate(cmd.code);
                        result.evalResult = evalRes;
                        break;
                    }
                    default: {
                        result = { status: 'error', message: `Unknown action: ${cmd.action}` };
                    }
                }

                await page.screenshot({ path: SCREENSHOT_PATH, timeout: 5000 }).catch(() => {});
                const elements = await getInteractiveElements(page);

                result.url = page.url();
                result.title = await page.title();
                result.elements = elements;
                result.screenshot = SCREENSHOT_PATH;

                await writeResponse(result);
                console.log(`📤 Ответ записан. Снимок экрана: ${SCREENSHOT_PATH}`);

            } catch (err) {
                console.error('Ошибка выполнения команды:', err.message);
                await writeResponse({ status: 'error', message: err.message });
            }

            try {
                fs.unlinkSync(COMMAND_FILE);
            } catch (e) {}
        }

        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

start().catch(err => {
    console.error('Ошибка:', err);
});
