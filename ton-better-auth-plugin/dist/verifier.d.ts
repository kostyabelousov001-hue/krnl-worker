export interface TonConnectProof {
    timestamp: number;
    domain: string;
    signature: string;
    payload: string;
    publicKey: string;
}
export declare function verifyTonConnectProof(addressStr: string, proof: TonConnectProof): boolean;
