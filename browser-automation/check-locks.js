const fs = require('fs');
const path = require('path');

const dir = path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data/Profile 3');
const files = [
    'History',
    'Network/Cookies',
    'Web Data',
    'Preferences'
];

console.log('Checking for file locks in Profile 3...');

files.forEach(f => {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) {
        try {
            // Попробуем открыть файл в режиме чтения-записи
            const fd = fs.openSync(p, 'r+');
            fs.closeSync(fd);
            console.log(`✓ ${f}: Доступен (нет блокировки)`);
        } catch (e) {
            console.log(`❌ ${f}: БЛОКИРОВАН (${e.code} - ${e.message})`);
        }
    } else {
        console.log(`? ${f}: Не существует по этому пути`);
    }
});
