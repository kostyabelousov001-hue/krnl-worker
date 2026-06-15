import { Address } from '@ton/core';
import { signVerify } from '@ton/crypto';
import * as crypto from 'crypto';

export interface TonConnectProof {
    timestamp: number;
    domain: string;
    signature: string; // Hex or base64
    payload: string;
    publicKey: string; // Hex
}

function sha256(buffer: Buffer): Buffer {
    return crypto.createHash('sha256').update(buffer).digest();
}

export function verifyTonConnectProof(addressStr: string, proof: TonConnectProof): boolean {
    try {
        const address = Address.parse(addressStr);
        const workchain = address.workChain;
        const addressHash = address.hash; // 32 bytes Buffer
        
        // 1. Build tonconnect-proof message buffer
        // - "tonconnect-proof" (string, 16 bytes)
        // - workchain (4 bytes, big endian int32)
        // - address_hash (32 bytes)
        // - domain_len (4 bytes, little endian uint32)
        // - domain (variable bytes)
        // - timestamp (8 bytes, little endian uint64)
        // - payload (variable bytes)
        
        const prefixBuffer = Buffer.from('tonconnect-proof'); // 16 bytes
        
        const workchainBuffer = Buffer.alloc(4);
        workchainBuffer.writeInt32BE(workchain);
        
        const domainBuffer = Buffer.from(proof.domain, 'utf8');
        const domainLenBuffer = Buffer.alloc(4);
        domainLenBuffer.writeUInt32LE(domainBuffer.length);
        
        const timestampBuffer = Buffer.alloc(8);
        // Write as 64-bit little-endian. Since JS numbers are double, we can use writeBigUInt64LE
        timestampBuffer.writeBigUInt64LE(BigInt(proof.timestamp));
        
        const payloadBuffer = Buffer.from(proof.payload, 'utf8');
        
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
        
        // 2. Build safe-sign message buffer
        // - \xff\xff
        // - "ton-safe-sign-magic" (string)
        // - proofHash (32 bytes)
        const signaturePrefix = Buffer.from([0xff, 0xff]);
        const signatureMagic = Buffer.from('ton-safe-sign-magic');
        
        const safeSignMessage = Buffer.concat([
            signaturePrefix,
            signatureMagic,
            proofHash
        ]);
        
        const finalHash = sha256(safeSignMessage);
        
        // 3. Verify signature using @ton/crypto or tweetnacl
        const signatureBuffer = Buffer.from(proof.signature, proof.signature.length === 128 ? 'hex' : 'base64');
        const publicKeyBuffer = Buffer.from(proof.publicKey, 'hex');
        
        return signVerify(finalHash, signatureBuffer, publicKeyBuffer);
    } catch (e) {
        console.error('Error verifying TonConnect proof:', e);
        return false;
    }
}
