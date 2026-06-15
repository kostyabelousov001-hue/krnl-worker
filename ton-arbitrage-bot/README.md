# TON DEX Arbitrage Bot

This bot monitors price spreads between **STON.fi** and **DeDust** for the TON/USDT pair on the TON mainnet. It computes pool prices using constant product formula and logs the net profit after accounting for fees (0.3% on STON.fi, 0.25% on DeDust) and network gas costs.

## Technical Details

- **USDT Master Contract**: `EQCxEWMouGEYD3O0T1c0o44Tq9O5S71B8O-7Y8m-9Wn_8a5S`
- **pTON Master Contract**: `EQCM3B12QK1Z4u3HVrg0acd9wpMBO_ylqfXX738gJE5gZsXI`
- **STON.fi API Endpoint**: `https://api.ston.fi/v1/pools`
- **DeDust API Endpoint**: `https://api.dedust.io/v2/pools`

## Setup and Running

1. Install dependencies in `ton-arbitrage-bot/`:
   ```bash
   npm install
   ```
2. Copy the `.env` file containing your wallet details into the parent directory.
3. Start the arbitrage monitor:
   ```bash
   node index.js
   ```
4. The bot will poll pools every 15 seconds and print out computed reserves and net profit yields.
