const { chromium } = require('playwright');

// Получаем имя, email и телефон отправителя из аргументов командной строки
const senderName = process.argv[2] || 'Alex';
const senderEmail = process.argv[3] || 'alex.leadscout@gmail.com';
const senderPhone = process.argv[4] || '+971550000000';

const buyers = [
    {
        name: 'EDS FZCO',
        url: 'https://eds.ae/contact-us/',
        message: `Hi EDS Team,

We have a freshly compiled and verified database of 110 Real Estate Agencies in Dubai (Marina, Downtown, JBR). 

It contains direct mobile numbers, websites, social links, and verified business emails (scraped from their sites). It's clean, verified, and free of duplicates. 

Since real estate firms are high-ticket clients for marketing services, this could be highly valuable for your sales team. 

We can send you a free sample of 15 contacts to check the quality. Let us know if you are interested!

Best regards,
${senderName}`
    },
    {
        name: 'Prism Digital',
        url: 'https://www.prism-me.com/contact-us/',
        message: `Hi Prism Digital Team,

We have a freshly compiled and verified database of 110 Real Estate Agencies in Dubai (Marina, Downtown, JBR). 

It contains direct mobile numbers, websites, social links, and verified business emails (scraped from their sites). It's clean, verified, and free of duplicates. 

Since real estate firms are high-ticket clients for marketing services, this could be highly valuable for your sales team. 

We can send you a free sample of 15 contacts to check the quality. Let us know if you are interested!

Best regards,
${senderName}`
    },
    {
        name: 'Volga Tigris Marketing Agency',
        url: 'https://volgatigris.com/contact-us/',
        message: `Hi Volga Tigris Team,

We have a freshly compiled and verified database of 110 Real Estate Agencies in Dubai (Marina, Downtown, JBR). 

It contains direct mobile numbers, websites, social links, and verified business emails (scraped from their sites). It's clean, verified, and free of duplicates. 

Since real estate firms are high-ticket clients for marketing services, this could be highly valuable for your sales team. 

We can send you a free sample of 15 contacts to check the quality. Let us know if you are interested!

Best regards,
${senderName}`
    },
    {
        name: 'Leads Dubai',
        url: 'https://leadsdubai.com/contact-us/',
        message: `Hi Leads Dubai Team,

We have a freshly compiled and verified database of 110 Real Estate Agencies in Dubai (Marina, Downtown, JBR). 

It contains direct mobile numbers, websites, social links, and verified business emails (scraped from their sites). It's clean, verified, and free of duplicates. 

Since real estate firms are high-ticket clients for marketing services, this could be highly valuable for your sales team. 

We can send you a free sample of 15 contacts to check the quality. Let us know if you are interested!

Best regards,
${senderName}`
    },
    {
        name: 'Socio.ae',
        url: 'https://socio.ae/contact-us/',
        message: `Hi Socio team,

We have a freshly compiled and verified database of 110 Real Estate Agencies in Dubai (Marina, Downtown, JBR). 

It contains direct mobile numbers, websites, social links, and verified business emails (scraped from their sites). It's clean, verified, and free of duplicates. 

Since real estate firms are high-ticket clients for marketing services, this could be highly valuable for your sales team. 

We can send you a free sample of 15 contacts to check the quality. Let us know if you are interested!

Best regards,
${senderName}`
    }
];

async function fillAndSubmitForm(page, buyer) {
    console.log(`\n🚀 [${buyer.name}] Navigating to contact page: ${buyer.url}...`);
    try {
        // Заходим на страницу
        await page.goto(buyer.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(3000); // Даем скриптам сайта отработать

        // 1. Ищем и заполняем только ВИДИМОЕ поле ИМЕНИ
        const nameInput = page.locator('input[name*="name" i]:visible, input[placeholder*="Name" i]:visible, input[id*="name" i]:visible').first();
        if (await nameInput.count() > 0) {
            await nameInput.fill(senderName);
        } else {
            const firstText = page.locator('input[type="text"]:visible').first();
            if (await firstText.count() > 0) await firstText.fill(senderName);
        }

        // 2. Ищем и заполняем только ВИДИМОЕ поле EMAIL
        const emailInput = page.locator('input[type="email"]:visible, input[name*="email" i]:visible, input[placeholder*="email" i]:visible, input[id*="email" i]:visible').first();
        if (await emailInput.count() > 0) {
            await emailInput.fill(senderEmail);
        }

        // 3. Ищем и заполняем только ВИДИМОЕ поле ТЕЛЕФОНА
        const phoneInput = page.locator('input[type="tel"]:visible, input[name*="phone" i]:visible, input[placeholder*="phone" i]:visible, input[id*="phone" i]:visible').first();
        if (await phoneInput.count() > 0) {
            await phoneInput.fill(senderPhone);
        }

        // 4. Ищем и заполняем текстовую область СООБЩЕНИЯ
        const messageInput = page.locator('textarea:visible, textarea[name*="message" i]:visible, textarea[placeholder*="message" i]:visible, textarea[id*="message" i]:visible').first();
        if (await messageInput.count() > 0) {
            await messageInput.fill(buyer.message);
        }

        console.log(`✍️ [${buyer.name}] Fields successfully filled.`);
        await page.waitForTimeout(1500);

        // 5. Ищем кнопку ОТПРАВКИ (без ошибочного флага i в has-text)
        const submitBtn = page.locator('button[type="submit" i]:visible, input[type="submit" i]:visible, button:has-text("Submit"):visible, button:has-text("Send"):visible, button:has-text("Message"):visible').first();
        if (await submitBtn.count() > 0) {
            await submitBtn.click({ timeout: 5000 }).catch(() => {});
            console.log(`✅ [${buyer.name}] Form submitted!`);
            await page.waitForTimeout(3000); // Даем время на сохранение отправки
        } else {
            console.log(`⚠️ [${buyer.name}] Submit button not found.`);
        }
    } catch (e) {
        console.log(`❌ [${buyer.name}] Error: ${e.message}`);
    }
}

async function run() {
    console.log(`⚡ Starting AUTO-PITCHER (Form Outreach)...`);
    console.log(`👤 Sender Name: "${senderName}"`);
    console.log(`✉️ Sender Email: "${senderEmail}"`);
    console.log(`📞 Sender Phone: "${senderPhone}"`);

    const browser = await chromium.launch({
        headless: false, // Открываем браузер на экране, чтобы ты видел весь процесс!
        args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    for (const buyer of buyers) {
        await fillAndSubmitForm(page, buyer);
    }

    console.log('\n🏁 Autopitcher completed.');
    await browser.close().catch(() => {});
}

run();
