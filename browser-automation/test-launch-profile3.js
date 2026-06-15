const { chromium } = require('playwright');
const path = require('path');

console.log('Launching test-launch-profile3...');
const userDataDir = path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data');

chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--start-maximized',
        '--profile-directory=Profile 3'
    ]
}).then(context => {
    console.log('Success! Browser launched under Profile 3.');
    process.exit(0);
}).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
