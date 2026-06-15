require('dotenv').config();
const { TonClient, WalletContractV4, fromNano } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');

async function main() {
    if (!process.env.TON_MNEMONIC) {
        console.error("Error: TON_MNEMONIC is not set in .env. Run node generate-wallet.js first!");
        process.exit(1);
    }

    const mnemonic = process.env.TON_MNEMONIC.split(' ');
    const keyPair = await mnemonicToPrivateKey(mnemonic);
    const workchain = 0;
    const wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
    
    const client = new TonClient({
        endpoint: 'https://toncenter.com/api/v2/jsonRPC',
        apiKey: process.env.TONCENTER_API_KEY || ''
    });
    
    const addressStr = wallet.address.toString({ testOnly: false, bounceable: false });
    console.log("Wallet address:", addressStr);
    
    try {
        const balance = await client.getBalance(wallet.address);
        console.log("Wallet balance:", fromNano(balance), "TON");
    } catch (err) {
        console.error("Error getting balance:", err.message);
    }
}

main().catch(console.error);
