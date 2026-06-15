import { BetterAuthPlugin } from 'better-auth/plugins';
export interface TonConnectPluginOptions {
    /**
     * Domain name of your application, used to verify the proof.
     * If not provided, domain verification will be skipped or checked against host.
     */
    domain?: string;
    /**
     * Lifetime of the generated payload/nonce in milliseconds.
     * Defaults to 5 minutes.
     */
    payloadLifetimeMs?: number;
    /**
     * Callback after a user successfully logs in via TonConnect.
     * Useful for updating database profiles.
     */
    onLogin?: (user: any) => Promise<void> | void;
}
export declare const tonConnect: (options?: TonConnectPluginOptions) => BetterAuthPlugin;
