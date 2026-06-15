const { mnemonicNew, mnemonicToPrivateKey } = require('@ton/crypto');
const { WalletContractV4 } = require('@ton/ton');
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("Generating a new TON wallet...");
    // Generate a 24-word mnemonic
    const mnemonic = await mnemonicNew();
    const keyPair = await mnemonicToPrivateKey(mnemonic);
    
    // Create v4R2 wallet contract
    const workchain = 0;
    const wallet = WalletContractV4.create({ workchain, publicKey: keyPair.publicKey });
    
    const address = wallet.address.toString({ testOnly: false, bounceable: false });
    
    console.log("\n=========================================");
    console.log("NEW TON WALLET GENERATED!");
    console.log("Address:", address);
    console.log("=========================================\n");
    
    // Save to .env in current folder
    const envContent = `TON_MNEMONIC="${mnemonic.join(' ')}"\nTON_WALLET_ADDRESS="${address}"\n`;
    fs.writeFileSync(path.join(__dirname, '.env'), envContent);
    console.log("Saved credentials to .env file.");
}

main().catch(console.error);
