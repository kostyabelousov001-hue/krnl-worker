# AI Agent Workspace - Goal: 77,000 RUB

This workspace is managed by the Antigravity AI Agent. It is designed to host several automation and monetization tools in the TON ecosystem and general web automation.

## Project Structure

1. **`ton-better-auth-plugin/`**: A TypeScript plugin for the `better-auth` framework to log in users using TonConnect 2.0 wallet proofs (resolves TON Society Bounty #1228).
   - [src/verifier.ts](file:///D:/whatimidoing/ton-better-auth-plugin/src/verifier.ts) - Proof verification algorithms.
   - [src/index.ts](file:///D:/whatimidoing/ton-better-auth-plugin/src/index.ts) - Plugin handler registration.
   - [tests/verifier.test.ts](file:///D:/whatimidoing/ton-better-auth-plugin/tests/verifier.test.ts) - Jest unit tests.
2. **`telegram-pay-bot/`**: A Node.js Telegram bot that charges users in TON to automatically scrape B2B Leads via Playwright in the background.
3. **`browser-automation/`**: Web scraping and lead generation scripts.
   - [lead-generator.js](file:///D:/whatimidoing/browser-automation/lead-generator.js) - B2B Google Maps lead generator.
4. **`ton-arbitrage-bot/`**: Node.js script monitoring STON.fi and DeDust for price gaps.

## Admin Scripts
- [generate-wallet.js](file:///D:/whatimidoing/generate-wallet.js) - Generates a new TON wallet address and saves credentials to `.env`.
- [check-wallet.js](file:///D:/whatimidoing/check-wallet.js) - Queries the balance of the generated wallet.

## Active Wallet Details
- **Address**: `UQAiGk86hw8TvbjHmlUC81shkzK21Ez7xb4pZhERMfx5hEdg`
- **Balance**: 0 TON (Mainnet)
