const { exec } = require('child_process');

console.log('Launching Chrome natively...');
const cmd = 'start "" "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --profile-directory="Profile 3"';

exec(cmd, (err, stdout, stderr) => {
    if (err) {
        console.error('Launch Error:', err);
    } else {
        console.log('Launch command executed successfully.');
    }
});

// Wait 5 seconds to check processes
setTimeout(() => {
    exec('tasklist /fi "imagename eq chrome.exe"', (err, stdout, stderr) => {
        console.log('\n--- Tasklist Output ---');
        console.log(stdout);
        
        exec('netstat -ano | findstr 9222', (err2, stdout2, stderr2) => {
            console.log('\n--- Netstat 9222 Output ---');
            console.log(stdout2 || 'Port 9222 is closed.');
            process.exit(0);
        });
    });
}, 5000);
