# Better-Auth TonConnect Plugin

A plugin for [better-auth](https://better-auth.com) that implements wallet authentication using the **TonConnect 2.0** protocol for the TON blockchain.

## Features

- `/api/auth/tonconnect/generate-payload`: Generates a cryptographic nonce (payload) for protection against replay attacks.
- `/api/auth/tonconnect/verify`: Verifies the wallet proof signature using TON safe sign rules (`ton-safe-sign-magic`) and automatically logs the user in, creating a database session.
- Secure, lightweight, and uses native Node.js crypto features.

## Installation

```bash
npm install better-auth-tonconnect @ton/core @ton/crypto
```

## Integration

### Server Setup

Include the `tonConnect` plugin in your `better-auth` configuration:

```typescript
import { auth } from "better-auth";
import { tonConnect } from "better-auth-tonconnect";

export const serverAuth = auth({
    database: {
        provider: "sqlite", // or postgres, mysql, etc.
        url: "file:./db.sqlite"
    },
    plugins: [
        tonConnect({
            domain: "your-app-domain.com", // verified against proof
            payloadLifetimeMs: 5 * 60 * 1000 // payload validity (5 minutes)
        })
    ]
});
```

### Client Flow

1. **Get Payload**: Request a payload from the server:
   ```typescript
   const response = await fetch("/api/auth/tonconnect/generate-payload");
   const { payload } = await response.json();
   ```
2. **TonConnect Sign**: Pass this payload to your TonConnect UI:
   ```typescript
   const tonConnectUI = new TonConnectUI({ ... });
   tonConnectUI.setConnectRequestParameters({
       state: "ready",
       value: { tonProof: payload }
   });
   ```
3. **Verify Proof**: On connection success, send the proof to your server endpoint:
   ```typescript
   const wallet = tonConnectUI.wallet;
   const proof = wallet.connectItems.tonProof.proof;
   
   const verifyResponse = await fetch("/api/auth/tonconnect/verify", {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({
           address: wallet.account.address,
           proof: {
               timestamp: proof.timestamp,
               domain: proof.domain.value,
               signature: proof.signature,
               payload: proof.payload,
               publicKey: wallet.account.publicKey
           }
       })
   });
   
   const result = await verifyResponse.json();
   // User is now logged in!
   ```

## Development and Testing

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run tests:
   ```bash
   npm run test
   ```
3. Build the plugin:
   ```bash
   npm run build
   ```
