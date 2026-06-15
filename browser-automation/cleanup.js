const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'leads.csv');
if (!fs.existsSync(csvPath)) {
    console.error("leads.csv does not exist!");
    process.exit(1);
}

// Read file as UTF-8 (ignoring BOM if present since we split lines)
let content = fs.readFileSync(csvPath, 'utf8');

// Remove BOM if present at the start
if (content.startsWith('\ufeff')) {
    content = content.slice(1);
}

const lines = content.split('\r\n').join('\n').split('\n');
const header = lines[0];
const cleanLines = [header];

for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split(';');
    const name = parts[0] ? parts[0].trim() : '';
    const phone = parts[3] ? parts[3].trim() : '';
    const website = parts[4] ? parts[4].trim() : '';
    
    // If name is N/A, skip this record to keep database premium
    if (name === 'N/A' || name === '' || (phone === 'N/A' && website === 'N/A')) {
        continue;
    }
    
    cleanLines.push(line);
}

// Write back with UTF-8 BOM
fs.writeFileSync(csvPath, '\ufeff' + cleanLines.join('\n') + '\n', 'utf8');
console.log(`Cleaned CSV. Retained ${cleanLines.length - 1} premium leads.`);
