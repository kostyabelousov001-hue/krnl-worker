require('dotenv').config({ path: '../.env' });
const { Telegraf } = require('telegraf');
const TonWeb = require('tonweb');
const fs = require('fs');
const path = require('path');
const { runScraper } = require('./scraper');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WALLET_ADDRESS = process.env.TON_WALLET_ADDRESS;
const PRICE_TON = parseFloat(process.env.PREMIUM_PRICE_TON || "0.5");
const TONCENTER_API_KEY = process.env.TONCENTER_API_KEY || "";

if (!BOT_TOKEN) {
    console.error("Error: TELEGRAM_BOT_TOKEN is not set in .env!");
    process.exit(1);
}

// Database file path
const dbPath = path.join(__dirname, 'users.json');

// Initialize local user database
let usersDb = {};
if (fs.existsSync(dbPath)) {
    try {
        usersDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch (e) {
        console.error("Error reading database, creating new one:", e.message);
    }
}

function saveDb() {
    fs.writeFileSync(dbPath, JSON.stringify(usersDb, null, 2));
}

// Initialize TON Web
const tonweb = new TonWeb(new TonWeb.HttpProvider('https://toncenter.com/api/v2/jsonRPC', {
    apiKey: TONCENTER_API_KEY
}));

const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) => {
    const userId = ctx.from.id.toString();
    if (!usersDb[userId]) {
        usersDb[userId] = {
            username: ctx.from.username || 'unknown',
            isPremium: false,
            memo: `pay_user_${userId}_${Math.floor(Math.random() * 1000)}`,
            createdAt: new Date().toISOString()
        };
        saveDb();
    }
    
    ctx.reply(`Привет, ${ctx.from.first_name}! 👋\n\n` +
              `Я — умный бот-парсер лидов и контактов с Google Maps.\n\n` +
              `💳 Получи **Premium-доступ** навсегда всего за **${PRICE_TON} TON**.\n` +
              `После оплаты ты сможешь отправлять мне любые поисковые запросы (например, 'dentists Chicago') и получать готовые базы контактов прямо в чат!\n\n` +
              `🔹 Отправь /pay для оплаты.\n` +
              `🔹 Отправь /check после оплаты, чтобы проверить баланс.\n` +
              `🔹 Отправь /premium для проверки статуса.`);
});

bot.command('pay', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = usersDb[userId];
    
    if (!user) {
        return ctx.reply("Пожалуйста, сначала отправь /start.");
    }
    
    if (user.isPremium) {
        return ctx.reply("У тебя уже есть Premium-доступ! 🎉 Можешь присылать поисковые запросы.");
    }

    if (!WALLET_ADDRESS) {
        return ctx.reply("К сожалению, адрес кошелька получателя не настроен в конфигурации бота.");
    }

    const memo = user.memo;
    const tonkeeperUrl = `https://app.tonkeeper.com/transfer/${WALLET_ADDRESS}?amount=${TonWeb.utils.toNano(PRICE_TON.toString())}&text=${encodeURIComponent(memo)}`;

    ctx.reply(`💳 **Оплата Premium-доступа**\n\n` +
              `Переведи ровно **${PRICE_TON} TON** на кошелек:\n` +
              `\`${WALLET_ADDRESS}\`\n\n` +
              `⚠️ **ОБЯЗАТЕЛЬНО укажи этот комментарий к платежу:**\n` +
              `\`${memo}\`\n\n` +
              `👉 [Оплатить через Tonkeeper](${tonkeeperUrl})\n\n` +
              `После транзакции нажми команду /check для подтверждения.`, { parse_mode: 'Markdown' });
});

bot.command('check', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = usersDb[userId];
    
    if (!user) {
        return ctx.reply("Отправь /start.");
    }
    
    if (user.isPremium) {
        return ctx.reply("Premium уже активирован! 🎉 Присылай поисковые запросы (например: 'fitness gyms Berlin').");
    }

    ctx.reply("🔍 Проверяю последние транзакции в блокчейне TON, пожалуйста подожди...");

    try {
        const txs = await tonweb.provider.getTransactions(WALLET_ADDRESS, 15);
        let found = false;
        
        for (const tx of txs) {
            if (tx.in_msg && tx.in_msg.value) {
                const valueInTon = parseFloat(TonWeb.utils.fromNano(tx.in_msg.value));
                const comment = tx.in_msg.message || '';
                
                if (comment.trim() === user.memo.trim() && Math.abs(valueInTon - PRICE_TON) < 0.01) {
                    found = true;
                    break;
                }
            }
        }

        if (found) {
            user.isPremium = true;
            user.premiumActivatedAt = new Date().toISOString();
            saveDb();
            ctx.reply("🎉 **Premium-доступ активирован!** 🎉\n\nТеперь ты можешь присылать мне любые запросы (например: 'restaurants Paris' или 'dentist Dubai'), и я соберу для тебя контакты в Excel файл!");
        } else {
            ctx.reply("❌ Транзакция не найдена. Если ты оплатил только что, подожди 1-2 минуты и попробуй /check снова.");
        }
    } catch (e) {
        console.error("Error checking transactions:", e.message);
        ctx.reply("⚠️ Ошибка при проверке транзакций. Попробуй позже.");
    }
});

bot.command('premium', (ctx) => {
    const userId = ctx.from.id.toString();
    const user = usersDb[userId];
    
    if (user && user.isPremium) {
        ctx.reply("🌟 **Твой статус: PREMIUM** 🌟\n\nПрисылай любые поисковые запросы текстом (например: 'hotels London') и я соберу для тебя контакты.");
    } else {
        ctx.reply("🔒 Твой статус: ОБЫЧНЫЙ\n\nИспользуй команду /pay для покупки Premium.");
    }
});

// Handle text search queries from premium users
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const user = usersDb[userId];
    
    // Ignore commands
    if (ctx.message.text.startsWith('/')) return;

    if (!user || !user.isPremium) {
        return ctx.reply("🔒 Функция доступна только для Premium-пользователей.\n\nИспользуй команду /pay для разблокировки.");
    }

    const query = ctx.message.text.trim();
    if (query.length < 3) {
        return ctx.reply("Пожалуйста, введи более подробный поисковый запрос (минимум 3 символа).");
    }

    ctx.reply(`🕵️‍♂️ Начинаю сбор B2B лидов по запросу: "${query}"...\n` +
              `Это займет около 1-2 минут (я просканирую Google Maps и сайты компаний на наличие email-адресов). Я отправлю файл, когда всё будет готово!`);

    const tempFilePath = path.join(__dirname, `leads_${userId}_${Date.now()}.csv`);

    try {
        // Run Playwright scraper (limit to 5 leads for quick test/demo, can be increased)
        const count = await runScraper(query, 5, tempFilePath);
        
        if (count > 0 && fs.existsSync(tempFilePath)) {
            await ctx.replyWithDocument({ source: tempFilePath, filename: `${query.replace(/\s+/g, '_')}_leads.csv` }, {
                caption: `✅ Успешно собрано ${count} лидов по запросу: "${query}"!`
            });
        } else {
            ctx.reply(`❌ По запросу "${query}" не удалось найти контакты. Попробуй изменить запрос.`);
        }
    } catch (err) {
        console.error("Scraper error:", err.message);
        ctx.reply("⚠️ Произошла ошибка во время сбора данных. Пожалуйста, попробуй позже.");
    } finally {
        // Clean up temp file
        if (fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
            } catch (e) {}
        }
    }
});

bot.launch();
console.log("=========================================");
console.log("TELEGRAM TON MONETIZATION BOT STARTED");
console.log("Listening for transactions & messages...");
console.log("=========================================");

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
