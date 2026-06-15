const { spawn, execSync } = require('child_process');
const http = require('http');

console.log('🤖 Инициализация запуска Chrome...');

// 1. Убиваем старые процессы Chrome для чистоты эксперимента
try {
    execSync('taskkill /f /im chrome.exe', { stdio: 'ignore' });
    console.log('✓ Старые процессы Chrome закрыты.');
} catch (e) {}

// 2. Запускаем Chrome через spawn в фоновом режиме (полный аналог ручного клика)
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const args = [
    '--remote-debugging-port=9222',
    '--profile-directory=Profile 3',
    '--disable-blink-features=AutomationControlled'
];

console.log(`🚀 Запуск: ${chromePath} ${args.join(' ')}`);

const child = spawn(chromePath, args, {
    detached: true,
    stdio: 'ignore'
});
child.unref();

// 3. Проверяем доступность порта отладки
let attempts = 0;
const check = () => {
    attempts++;
    console.log(`Проверка порта 9222 (Попытка ${attempts}/15)...`);
    
    const req = http.get('http://127.0.0.1:9222/json/version', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            console.log('\n✅ ПОДКЛЮЧЕНИЕ УСПЕШНО! Chrome открыт на порту 9222.');
            console.log(data);
            process.exit(0);
        });
    });
    
    req.on('error', (err) => {
        if (attempts < 15) {
            setTimeout(check, 1000);
        } else {
            console.log('\n❌ Не удалось зацепиться за порт 9222. Возможно, Chrome блокирует порт отладки.');
            process.exit(1);
        }
    });
    
    req.end();
};

setTimeout(check, 2000);
