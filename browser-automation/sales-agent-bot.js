const { exec } = require('child_process');
const path = require('path');

const TON_WALLET = 'UQDvz0Bh8hx88bBFPI-JV2xfGAubFngPaDBrl8ldHRHiJOU4';

// Состояние бота
const state = {
    email: '',
    status: 'Initializing...',
    messages: [],
    checkedCount: 0,
    pitchingStatus: 'Waiting to start...'
};

let token = '';

async function getTempEmail() {
    state.status = 'Fetching available domains...';
    renderUI();
    try {
        // 1. Получаем доступные домены
        const domRes = await fetch('https://api.mail.tm/domains');
        const domData = await domRes.json();
        const domain = domData['hydra:member']?.[0]?.domain || 'web-library.net';
        
        // Генерируем случайный логин и пароль
        const rand = Math.random().toString(36).substring(2, 10);
        const address = `sales.${rand}@${domain}`;
        const password = Math.random().toString(36).substring(2, 15);
        
        state.status = 'Creating account on mail.tm...';
        renderUI();
        
        // 2. Создаем аккаунт
        const createRes = await fetch('https://api.mail.tm/accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, password })
        });
        
        if (!createRes.ok) {
            const errText = await createRes.text();
            throw new Error(`Account creation failed: ${errText}`);
        }
        
        state.email = address;
        
        state.status = 'Authenticating...';
        renderUI();
        
        // 3. Получаем токен авторизации (JWT)
        const tokenRes = await fetch('https://api.mail.tm/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, password })
        });
        
        const tokenData = await tokenRes.json();
        token = tokenData.token;
        
        state.status = 'Temp email ready and authenticated ✓';
    } catch (e) {
        state.status = `Error generating email: ${e.message}`;
        renderUI();
        process.exit(1);
    }
    renderUI();
}

function runAutoPitcher() {
    state.pitchingStatus = 'Launching Auto-Pitcher...';
    renderUI();
    
    // Запускаем auto-pitcher.js с временным email
    const cmd = `node auto-pitcher.js "Alex" "${state.email}" "+971550000000"`;
    
    exec(cmd, { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) {
            state.pitchingStatus = `Pitcher error: ${error.message}`;
        } else {
            state.pitchingStatus = 'Pitching completed! Waiting for replies...';
        }
        renderUI();
    });
}

async function checkInbox() {
    if (!token) return;
    state.checkedCount++;
    try {
        const res = await fetch('https://api.mail.tm/messages', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        const list = data['hydra:member'] || [];

        if (list.length > state.messages.length) {
            // Пришли новые сообщения!
            // Проигрываем звуковой сигнал (ASCII Bell)
            process.stdout.write('\x07');
            
            const newMessages = list.slice(state.messages.length);
            for (const msg of newMessages) {
                // Читаем полное тело письма
                const detailRes = await fetch(`https://api.mail.tm/messages/${msg.id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const detail = await detailRes.json();
                
                state.messages.push({
                    id: msg.id,
                    from: msg.from.address || msg.from.name || 'Unknown',
                    subject: msg.subject,
                    date: msg.createdAt,
                    body: detail.text || detail.intro || '[No content]'
                });
            }
        }
    } catch (e) {
        // Игнорируем сетевые ошибки
    }
    renderUI();
}

function renderUI() {
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
    console.log(`${cyan}│${reset}${bold}${yellow}          ⚡ KRNL AUTONOMOUS SALES AGENT BOT (TON MONETIZATION) ⚡                 ${cyan}│${reset}`);
    console.log(`${cyan}└${'─'.repeat(w - 2)}┘${reset}`);
    
    console.log(`  ${bold}Temp Email:${reset} ${bold}${green}${state.email || 'Generating...'}${reset}`);
    console.log(`  ${bold}Wallet TON:${reset} ${bold}${cyan}${TON_WALLET}${reset}`);
    console.log(`  ${bold}Status:${reset} ${state.status}`);
    console.log(`  ${bold}Pitcher:${reset} ${state.pitchingStatus}`);
    console.log(`  ${bold}Inbox checks:${reset} ${state.checkedCount} times`);
    console.log(`${cyan}  ${'─'.repeat(w - 4)}${reset}`);
    
    console.log(`  ${bold}INBOX:${reset}`);
    if (state.messages.length === 0) {
        console.log(`  ${gray}[Waiting for replies from marketing agencies... No emails received yet]${reset}`);
    } else {
        state.messages.forEach((msg, idx) => {
            console.log(`\n  ${bold}${green}[MESSAGE #${idx + 1}] FROM: ${msg.from}${reset}`);
            console.log(`  Subject: ${bold}${msg.subject}${reset}`);
            console.log(`  ${cyan}┌${'─'.repeat(w - 6)}┐${reset}`);
            // Выводим тело сообщения с отступом
            const lines = msg.body.split('\n').slice(0, 10);
            lines.forEach(l => {
                if (l.trim()) console.log(`  │ ${l.substring(0, w - 8)}`);
            });
            if (msg.body.split('\n').length > 10) {
                console.log(`  │ ... [truncated]`);
            }
            console.log(`  ${cyan}└${'─'.repeat(w - 6)}┘${reset}`);
            
            // Генерируем готовый ответ для копирования
            console.log(`  ${bold}${yellow}👉 ГОТОВЫЙ ОТВЕТ ДЛЯ ОТПРАВКИ ЭТОМУ КЛИЕНТУ:${reset}`);
            console.log(`  ────────────────────────────────────────────────────────────────────────`);
            console.log(`  Hi,\n\n  Thank you for your interest! As promised, you can check the free sample of 15 Dubai real estate leads here:\n  https://github.com/your-username/dubai-leads-sample (or send as attachment)\n\n  To unlock the full database of 110 active Dubai real estate leads (Excel, CSV, HTML dashboard, JSON),\n  please send 10 TON (or 50 USD equivalent) to this TON Wallet Address:\n  ${bold}${magenta}${TON_WALLET}${reset}\n\n  Once the transaction is sent, reply to this email with the transaction hash or screenshot.\n  We will instantly deliver the complete database.\n\n  Best regards,\n  Alex`);
            console.log(`  ────────────────────────────────────────────────────────────────────────`);
        });
    }
    
    console.log(`\n${cyan}└${'─'.repeat(w - 2)}┘${reset}`);
    console.log(`  Press ${bold}Ctrl+C${reset} to exit the bot.`);
}

async function start() {
    await getTempEmail();
    runAutoPitcher();
    
    // Опрашиваем почту каждые 20 секунд
    setInterval(checkInbox, 20000);
}

start();
