import { verifyTonConnectProof, TonConnectProof } from '../src/verifier.js';
import { mnemonicNew, mnemonicToPrivateKey, sign } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';
import * as crypto from 'crypto';

function sha256(buffer: Buffer): Buffer {
    return crypto.createHash('sha256').update(buffer).digest();
}

describe('TonConnect Proof Verifier', () => {
    let keyPair: { publicKey: Buffer; secretKey: Buffer };
    let walletAddress: string;
    let publicKeyHex: string;

    beforeAll(async () => {
        // Generate test keys
        const mnemonic = await mnemonicNew();
        keyPair = await mnemonicToPrivateKey(mnemonic);
        
        // Build address
        const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
        walletAddress = wallet.address.toString({ testOnly: false, bounceable: false });
        publicKeyHex = keyPair.publicKey.toString('hex');
    });

    it('should verify a valid proof signature', () => {
        const timestamp = Math.floor(Date.now() / 1000);
        const domain = 'localhost:3000';
        const payload = 'random_payload_nonce_here';

        // Reconstruct the message to sign exactly as in verifier
        const prefixBuffer = Buffer.from('tonconnect-proof');
        const workchainBuffer = Buffer.alloc(4);
        workchainBuffer.writeInt32BE(0); // workchain 0

        const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
        const addressHash = wallet.address.hash;

        const domainBuffer = Buffer.from(domain, 'utf8');
        const domainLenBuffer = Buffer.alloc(4);
        domainLenBuffer.writeUInt32LE(domainBuffer.length);

        const timestampBuffer = Buffer.alloc(8);
        timestampBuffer.writeBigUInt64LE(BigInt(timestamp));

        const payloadBuffer = Buffer.from(payload, 'utf8');

        const proofMessage = Buffer.concat([
            prefixBuffer,
            workchainBuffer,
            addressHash,
            domainLenBuffer,
            domainBuffer,
            timestampBuffer,
            payloadBuffer
        ]);

        const proofHash = sha256(proofMessage);

        const signaturePrefix = Buffer.from([0xff, 0xff]);
        const signatureMagic = Buffer.from('ton-safe-sign-magic');

        const safeSignMessage = Buffer.concat([
            signaturePrefix,
            signatureMagic,
            proofHash
        ]);

        const finalHash = sha256(safeSignMessage);

        // Sign finalHash using our test private key
        const signature = sign(finalHash, keyPair.secretKey);

        const proof: TonConnectProof = {
            timestamp,
            domain,
            signature: signature.toString('hex'),
            payload,
            publicKey: publicKeyHex
        };

        const result = verifyTonConnectProof(walletAddress, proof);
        expect(result).toBe(true);
    });

    it('should reject invalid signatures', () => {
        const proof: TonConnectProof = {
            timestamp: Math.floor(Date.now() / 1000),
            domain: 'localhost:3000',
            signature: Buffer.alloc(64).toString('hex'), // Dummy signature
            payload: 'dummy_payload',
            publicKey: publicKeyHex
        };

        const result = verifyTonConnectProof(walletAddress, proof);
        expect(result).toBe(false);
    });
});
