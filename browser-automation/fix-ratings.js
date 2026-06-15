/**
 * fix-ratings.js
 * 
 * Читает leads.csv и:
 *  1. Заменяет "рейтинги" которые на самом деле выглядят как дата → "N/A"
 *  2. Убирает колонки Facebook / Instagram / LinkedIn
 *  3. Сохраняет чистый файл как leads_fixed.csv
 * 
 * Запуск: node fix-ratings.js
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE  = path.join(__dirname, 'leads.csv');
const OUTPUT_FILE = path.join(__dirname, 'leads_fixed.csv');

// --- Определяет, является ли строка датой, а не рейтингом ---
function looksLikeDate(str) {
    if (!str || str === 'N/A') return false;
    const s = str.trim();

    // Паттерны дат:
    const datePatterns = [
        /\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}/,     // 15.06.2024 / 15/06/2024
        /\d{4}[./\-]\d{1,2}[./\-]\d{1,2}/,         // 2024-06-15
        /[A-Za-zА-Яа-я]{3,}\s+\d{1,2}/,            // Jun 15 / Июн 15
        /\d{1,2}\s+[A-Za-zА-Яа-я]{3,}/,            // 15 Jun / 15 Июн
        /\d{1,2}:\d{2}/,                            // 09:00 (время открытия)
    ];

    for (const re of datePatterns) {
        if (re.test(s)) return true;
    }

    // Если нормальный рейтинг — число от 1.0 до 5.0
    const normalized = s.replace(',', '.');
    const num = parseFloat(normalized);
    if (!isNaN(num) && num >= 1.0 && num <= 5.0 && normalized.length <= 4) {
        return false; // Это нормальный рейтинг, не трогаем
    }

    // Всё остальное нечисловое — подозрительно
    if (isNaN(num)) return true;

    return false;
}

// --- Парсер CSV с разделителем ";" (учитывает кавычки) ---
function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === ';' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

function toCsvCell(value) {
    if (value == null) return '';
    const s = String(value);
    if (s.startsWith('="') && s.endsWith('"') && !s.slice(2, -1).includes(';') && !s.slice(2, -1).includes('"')) {
        return s;
    }
    if (s.includes(';') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

// --- MAIN ---
if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌  Файл не найден: ${INPUT_FILE}`);
    process.exit(1);
}

const raw = fs.readFileSync(INPUT_FILE, 'utf8').replace(/^\ufeff/, ''); // убираем BOM
const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '');

if (lines.length < 2) {
    console.error('❌  CSV пустой или содержит только заголовок.');
    process.exit(1);
}

// Парсим заголовок
const headerLine = lines[0];
const headers = parseCsvLine(headerLine);

// Индексы колонок
const ratingIdx  = headers.findIndex(h => h.trim().toLowerCase().includes('rating'));
const fbIdx      = headers.findIndex(h => h.trim().toLowerCase().includes('facebook'));
const igIdx      = headers.findIndex(h => h.trim().toLowerCase().includes('instagram'));
const liIdx      = headers.findIndex(h => h.trim().toLowerCase().includes('linkedin'));

// Колонки которые УДАЛЯЕМ (соцсети)
const removeIdxSet = new Set([fbIdx, igIdx, liIdx].filter(i => i !== -1));

console.log(`\n📄  Загружено строк: ${lines.length - 1}`);
console.log(`📌  Колонка Rating: [${ratingIdx}]`);
console.log(`🗑️   Удаляем колонки: Facebook[${fbIdx}] Instagram[${igIdx}] LinkedIn[${liIdx}]`);

// Новый заголовок без соцсетей
const newHeaders = headers.filter((_, i) => !removeIdxSet.has(i));

let fixedCount = 0;
let totalData  = 0;

const outputLines = [newHeaders.map(toCsvCell).join(';')];

for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    totalData++;

    // Фикс рейтинга
    if (ratingIdx !== -1 && cells[ratingIdx] !== undefined) {
        const oldRating = cells[ratingIdx].trim();
        if (looksLikeDate(oldRating)) {
            console.log(`  ⚠️  Строка ${i}: рейтинг "${oldRating}" → N/A (дата)`);
            fixedCount++;
        }
        // 🔥 ="4.8" — Excel-формула, 100% защита от авто-конверсии в дату
        cells[ratingIdx] = (oldRating && oldRating !== 'N/A') ? ('="' + oldRating + '"') : 'N/A';
    }

    // Убираем соцсети
    const newCells = cells.filter((_, idx) => !removeIdxSet.has(idx));
    outputLines.push(newCells.map(toCsvCell).join(';'));
}

// BOM + запись
const output = '\ufeff' + outputLines.join('\n');
fs.writeFileSync(OUTPUT_FILE, output, 'utf8');

console.log(`\n✅  Готово!`);
console.log(`   Всего строк обработано : ${totalData}`);
console.log(`   Рейтингов исправлено   : ${fixedCount}`);
console.log(`   Файл сохранён          : ${OUTPUT_FILE}\n`);
