const { exec } = require('child_process');
const http = require('http');

console.log('Launching Chrome natively...');
const cmd = '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222';
exec(cmd);

let attempts = 0;
const check = () => {
    attempts++;
    console.log(`Checking port 9222 (Attempt ${attempts}/15)...`);
    
    const req = http.get('http://127.0.0.1:9222/json/version', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            console.log('\n✅ УСПЕХ! Подключение к Chrome по CDP успешно выполнено!');
            console.log(data);
            process.exit(0);
        });
    });
    
    req.on('error', (err) => {
        console.log(`Порт закрыт: ${err.message}`);
        if (attempts < 15) {
            setTimeout(check, 1000);
        } else {
            console.log('\n❌ Не удалось подключиться к порту 9222 за 15 секунд.');
            process.exit(1);
        }
    });
    
    req.end();
};

setTimeout(check, 1000);
