require('dotenv').config({ path: '../.env' });
const axios = require('axios');
const { toNano, fromNano, TonClient, WalletContractV4 } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');

// Target Jetton Master addresses
const USDT_MASTER = "EQCxEWMouGEYD3O0T1c0o44Tq9O5S71B8O-7Y8m-9Wn_8a5S";
const PTON_MASTER = "EQCM3B12QK1Z4u3HVrg0acd9wpMBO_ylqfXX738gJE5gZsXI"; // STON.fi TON wrapper

// Configuration
const FEE_STON = 0.003; // 0.3% pool fee
const FEE_DEDUST = 0.0025; // 0.25% pool fee
const ESTIMATED_GAS = 0.5; // Gas reserved per round (in TON)
const CHECK_INTERVAL_MS = 15000; // Check every 15 seconds
const ARBITRAGE_INPUT_TON = "100"; // Test spread with 100 TON

async function fetchStonfiReserves() {
    try {
        const res = await axios.get("https://api.ston.fi/v1/pools");
        const pool = res.data.pools.find(p => 
            (p.token0_address === PTON_MASTER && p.token1_address === USDT_MASTER) ||
            (p.token1_address === PTON_MASTER && p.token0_address === USDT_MASTER)
        );
        if (!pool) throw new Error("Ston.fi TON/USDT pool not found");
        
        const isToken0Ton = pool.token0_address === PTON_MASTER;
        return {
            reserveTON: BigInt(isToken0Ton ? pool.token0_balance : pool.token1_balance),
            reserveUSDT: BigInt(isToken0Ton ? pool.token1_balance : pool.token0_balance)
        };
    } catch (e) {
        console.error("Error fetching STON.fi reserves:", e.message);
        return null;
    }
}

async function fetchDedustReserves() {
    try {
        const res = await axios.get("https://api.dedust.io/v2/pools");
        const pool = res.data.find(p => {
            const assets = p.assets;
            const hasTon = assets.some(a => a.type === 'native');
            const hasUsdt = assets.some(a => a.type === 'jetton' && a.address === USDT_MASTER);
            return hasTon && hasUsdt;
        });
        if (!pool) throw new Error("DeDust TON/USDT pool not found");
        
        const isAsset0Ton = pool.assets[0].type === 'native';
        return {
            poolAddress: pool.address,
            reserveTON: BigInt(isAsset0Ton ? pool.reserves[0] : pool.reserves[1]),
            reserveUSDT: BigInt(isAsset0Ton ? pool.reserves[1] : pool.reserves[0])
        };
    } catch (e) {
        console.error("Error fetching DeDust reserves:", e.message);
        return null;
    }
}

// Uniswap v2 Constant Product (x * y = k) output formula
function calculateOutputAmount(amountIn, reserveIn, reserveOut, feeRate) {
    const amountInBI = BigInt(amountIn);
    const reserveInBI = BigInt(reserveIn);
    const reserveOutBI = BigInt(reserveOut);
    
    const multiplier = BigInt(Math.round((1 - feeRate) * 10000));
    const amountInWithFee = amountInBI * multiplier;
    
    const numerator = amountInWithFee * reserveOutBI;
    const denominator = (reserveInBI * 10000n) + amountInWithFee;
    
    return numerator / denominator;
}

async function checkArbitrage() {
    console.log(`\n[${new Date().toLocaleTimeString()}] Checking TON/USDT spreads...`);
    
    const stonReserves = await fetchStonfiReserves();
    const dedustReserves = await fetchDedustReserves();
    
    if (!stonReserves || !dedustReserves) {
        console.log("Could not load reserves data.");
        return;
    }
    
    const inputTON = toNano(ARBITRAGE_INPUT_TON);
    
    // Scenario 1: TON -> USDT on STON.fi -> TON on DeDust
    const usdtFromSton = calculateOutputAmount(
        inputTON,
        stonReserves.reserveTON,
        stonReserves.reserveUSDT,
        FEE_STON
    );
    const tonFromDedust = calculateOutputAmount(
        usdtFromSton,
        dedustReserves.reserveUSDT,
        dedustReserves.reserveTON,
        FEE_DEDUST
    );
    
    // Scenario 2: TON -> USDT on DeDust -> TON on STON.fi
    const usdtFromDedust = calculateOutputAmount(
        inputTON,
        dedustReserves.reserveTON,
        dedustReserves.reserveUSDT,
        FEE_DEDUST
    );
    const tonFromSton = calculateOutputAmount(
        usdtFromDedust,
        stonReserves.reserveUSDT,
        stonReserves.reserveTON,
        FEE_STON
    );
    
    const gasInNano = toNano(ESTIMATED_GAS.toString());
    const netProfit1 = tonFromDedust - inputTON - gasInNano;
    const netProfit2 = tonFromSton - inputTON - gasInNano;
    
    console.log(`Ston.fi Reserves: TON: ${fromNano(stonReserves.reserveTON)} | USDT: ${(Number(stonReserves.reserveUSDT)/1e6).toFixed(2)}`);
    console.log(`DeDust Reserves:  TON: ${fromNano(dedustReserves.reserveTON)}  | USDT: ${(Number(dedustReserves.reserveUSDT)/1e6).toFixed(2)}`);
    
    console.log(`\nScenario 1 (Ston -> Dedust): Net Profit: ${fromNano(netProfit1)} TON`);
    console.log(`Scenario 2 (Dedust -> Ston): Net Profit: ${fromNano(netProfit2)} TON`);
    
    if (netProfit1 > 0n) {
        console.log(`🔥 Arbitrage Opportunity Found! STON.fi -> DeDust. Profit: ${fromNano(netProfit1)} TON`);
        await triggerArbitrageExecution('ston-to-dedust', inputTON);
    } else if (netProfit2 > 0n) {
        console.log(`🔥 Arbitrage Opportunity Found! DeDust -> STON.fi. Profit: ${fromNano(netProfit2)} TON`);
        await triggerArbitrageExecution('dedust-to-ston', inputTON);
    } else {
        console.log("No profitable spread detected.");
    }
}

async function triggerArbitrageExecution(direction, amount) {
    if (!process.env.TON_MNEMONIC) {
        console.log("Execution skipped: No TON_MNEMONIC found in .env file.");
        return;
    }
    console.log(`Executing swap: ${direction} with amount: ${fromNano(amount)} TON...`);
    // Outbound transaction logic would go here
    // Under safe mode, we only simulate the opportunities to protect funds
}

async function main() {
    console.log("=========================================");
    console.log("TON DEX ARBITRAGE BOT STARTED");
    console.log(`Monitoring interval: ${CHECK_INTERVAL_MS}ms`);
    console.log(`Test Input Volume: ${ARBITRAGE_INPUT_TON} TON`);
    console.log("=========================================");
    
    if (process.env.TON_WALLET_ADDRESS) {
        console.log("Agent Wallet Address:", process.env.TON_WALLET_ADDRESS);
    }
    
    setInterval(checkArbitrage, CHECK_INTERVAL_MS);
    await checkArbitrage();
}

main().catch(console.error);
