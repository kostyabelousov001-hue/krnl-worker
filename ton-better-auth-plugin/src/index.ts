import { BetterAuthPlugin, createAuthEndpoint } from 'better-auth/plugins';
import { verifyTonConnectProof, TonConnectProof } from './verifier.js';
import * as crypto from 'crypto';

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

export const tonConnect = (options?: TonConnectPluginOptions): BetterAuthPlugin => {
    const domain = options?.domain;
    const lifetime = options?.payloadLifetimeMs || 5 * 60 * 1000; // 5 mins
    
    // In-memory store for payloads/nonces (in production, use DB or cache)
    const activePayloads = new Map<string, { expiresAt: number }>();
    
    return {
        id: 'tonconnect',
        endpoints: {
            generatePayload: createAuthEndpoint(
                '/tonconnect/generate-payload',
                {
                    method: 'GET'
                },
                async (ctx) => {
                    const payload = crypto.randomBytes(32).toString('hex');
                    const expiresAt = Date.now() + lifetime;
                    activePayloads.set(payload, { expiresAt });
                    
                    // Cleanup expired payloads
                    for (const [key, val] of activePayloads.entries()) {
                        if (val.expiresAt < Date.now()) {
                            activePayloads.delete(key);
                        }
                    }
                    
                    return ctx.json({ payload });
                }
            ),
            
            verifyProof: createAuthEndpoint(
                '/tonconnect/verify',
                {
                    method: 'POST'
                },
                async (ctx: any) => {
                    const body = ctx.body as {
                        address: string;
                        proof: TonConnectProof;
                    };
                    
                    if (!body.address || !body.proof) {
                        return ctx.json({ error: 'Missing address or proof' }, { status: 400 });
                    }
                    
                    // 1. Verify payload (must be active and not expired)
                    const payloadRecord = activePayloads.get(body.proof.payload);
                    if (!payloadRecord || payloadRecord.expiresAt < Date.now()) {
                        return ctx.json({ error: 'Invalid or expired payload/nonce' }, { status: 400 });
                    }
                    
                    // Consume the payload (single use)
                    activePayloads.delete(body.proof.payload);
                    
                    // 2. Verify domain match if configured
                    if (domain && body.proof.domain !== domain) {
                        return ctx.json({ error: 'Domain mismatch' }, { status: 400 });
                    }
                    
                    // 3. Verify signature of the proof
                    const isValid = verifyTonConnectProof(body.address, body.proof);
                    if (!isValid) {
                        return ctx.json({ error: 'Invalid signature proof' }, { status: 400 });
                    }
                    
                    // 4. Authenticate or create user in BetterAuth context
                    const userAccount = await ctx.context.database.findOne({
                        model: 'account',
                        where: {
                            providerId: 'tonconnect',
                            accountId: body.address
                        }
                    });
                    
                    let user;
                    if (userAccount) {
                        user = await ctx.context.database.findOne({
                            model: 'user',
                            where: { id: userAccount.userId }
                        });
                    } else {
                        // Create a new user with this TON address
                        user = await ctx.context.database.create({
                            model: 'user',
                            data: {
                                name: `TON User (${body.address.slice(0, 6)}...)`,
                                email: `${body.address.toLowerCase()}@tonconnect.local`,
                                emailVerified: true
                            }
                        });
                        
                        await ctx.context.database.create({
                            model: 'account',
                            data: {
                                userId: user.id,
                                providerId: 'tonconnect',
                                accountId: body.address,
                                password: '' // No password for TON login
                            }
                        });
                    }
                    
                    if (!user) {
                        return ctx.json({ error: 'Failed to retrieve or create user' }, { status: 500 });
                    }
                    
                    // 5. Create session
                    const session = await ctx.context.createSession({
                        userId: user.id
                    });
                    
                    if (options?.onLogin) {
                        await options.onLogin(user);
                    }
                    
                    return ctx.json({
                        session,
                        user
                    });
                }
            )
        }
    };
};
