const { exec } = require('child_process');

console.log('Starting chrome.exe...');
const cmd = '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --profile-directory="Profile 3"';

const child = exec(cmd, (err, stdout, stderr) => {
    console.log('Process exited.');
    console.log('Error:', err);
    console.log('Stdout:', stdout);
    console.log('Stderr:', stderr);
});

// Keep open for 5 seconds
setTimeout(() => {
    console.log('5 seconds passed. Exiting test script...');
    process.exit(0);
}, 5000);
