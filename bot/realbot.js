const hre = require("hardhat");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const MIN_PROFIT_PERCENT = 0.15;
const GAS_COST_USD = 50;
const BORROW_AMOUNT_USD = 100000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAllPrices() {
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=ethereum,wrapped-bitcoin,binancecoin,matic-network,solana,avalanche-2,arbitrum,chainlink,uniswap,dogecoin&vs_currencies=usd`,
      { headers: { "Accept": "application/json" } }
    );
    const data = await response.json();
    return {
      ETH:   data["ethereum"]?.usd || null,
      WBTC:  data["wrapped-bitcoin"]?.usd || null,
      BNB:   data["binancecoin"]?.usd || null,
      MATIC: data["matic-network"]?.usd || null,
      SOL:   data["solana"]?.usd || null,
      AVAX:  data["avalanche-2"]?.usd || null,
      ARB:   data["arbitrum"]?.usd || null,
      LINK:  data["chainlink"]?.usd || null,
      UNI:   data["uniswap"]?.usd || null,
      DOGE:  data["dogecoin"]?.usd || null
    };
  } catch (err) {
    console.log("   ⚠️ Price fetch failed, retrying next scan...");
    return null;
  }
}

async function deployContracts() {
  const MockToken = await hre.ethers.getContractFactory("MockToken");
  const token = await MockToken.deploy();
  await token.waitForDeployment();

  const MockPool = await hre.ethers.getContractFactory("MockPool");
  const pool = await MockPool.deploy();
  await pool.waitForDeployment();

  const MockAddressProvider = await hre.ethers.getContractFactory("MockAddressProvider");
  const provider = await MockAddressProvider.deploy();
  await provider.waitForDeployment();
  await provider.setPoolAddress(await pool.getAddress());

  const DEX_A = await hre.ethers.getContractFactory("DEX_A");
  const dexA = await DEX_A.deploy(await token.getAddress());
  await dexA.waitForDeployment();

  const DEX_B = await hre.ethers.getContractFactory("DEX_B");
  const dexB = await DEX_B.deploy(await token.getAddress());
  await dexB.waitForDeployment();

  const FlashLoan = await hre.ethers.getContractFactory("FlashLoan");
  const flashLoan = await FlashLoan.deploy(await provider.getAddress());
  await flashLoan.waitForDeployment();

  await flashLoan.setDEXes(
    await dexA.getAddress(),
    await dexB.getAddress(),
    await token.getAddress()
  );

  const million = hre.ethers.parseUnits("1000000", 6);
  const buffer = hre.ethers.parseUnits("10000", 6);
  await token.mint(await pool.getAddress(), million);
  await token.mint(await dexA.getAddress(), million);
  await token.mint(await dexB.getAddress(), million);
  await token.mint(await flashLoan.getAddress(), buffer);

  return { token, flashLoan };
}

async function scanAndTrade(flashLoan, token, prices) {
  let scanProfit = 0;

  for (const [name, price] of Object.entries(prices)) {
    if (!price) continue;

    const slippage = 0.003;
    const uniswapPrice = price * (1 + (Math.random() - 0.5) * slippage);
    const sushiswapPrice = price * (1 + (Math.random() - 0.5) * slippage);
    const diffPercent = Math.abs(uniswapPrice - sushiswapPrice) / uniswapPrice * 100;
    const grossProfitUSD = BORROW_AMOUNT_USD * (diffPercent / 100);
    const flashFeeUSD = BORROW_AMOUNT_USD * 0.0005;
    const netProfitUSD = grossProfitUSD - flashFeeUSD - GAS_COST_USD;

    const direction = uniswapPrice < sushiswapPrice
      ? "Uniswap→Sushiswap"
      : "Sushiswap→Uniswap";

    console.log(`   ${name}: $${price.toFixed(4)} | Diff: ${diffPercent.toFixed(4)}% | Profit: $${netProfitUSD.toFixed(2)}`);

    if (diffPercent > MIN_PROFIT_PERCENT && netProfitUSD > 0) {
      console.log(`   🚨 OPPORTUNITY: ${direction}`);
      try {
        const tokenAddress = await token.getAddress();
        const balanceBefore = await token.balanceOf(await flashLoan.getAddress());
        const borrowAmount = hre.ethers.parseUnits("100000", 6);
        await flashLoan.requestFlashLoan(tokenAddress, borrowAmount);
        const balanceAfter = await token.balanceOf(await flashLoan.getAddress());
        const profit = parseFloat(hre.ethers.formatUnits(balanceAfter - balanceBefore, 6));
        console.log(`   ✅ Executed! Profit: ${profit} mUSDC`);
        scanProfit += profit;
      } catch (err) {
        console.log(`   ❌ Failed: ${err.message}`);
      }
    }
  }
  return scanProfit;
}

async function runRealBot() {
  console.log("🤖 Real Flash Loan Arbitrage Bot");
  console.log("📡 Live prices from CoinGecko");
  console.log("💱 Trading pairs: ETH, WBTC, BNB, MATIC, SOL, AVAX, ARB, LINK, UNI, DOGE");
  console.log("⛓️  Executing on local Hardhat network\n");

  console.log("Deploying contracts...");
  const { token, flashLoan } = await deployContracts();
  console.log("✅ Contracts deployed!\n");

  let totalProfit = 0;
  let scanCount = 0;
  let tradesExecuted = 0;

  console.log("🔍 Scanning every 15 seconds...\n");
  console.log("─────────────────────────────────────────────");

  async function scan() {
    scanCount++;
    console.log(`\n📊 Scan #${scanCount} - ${new Date().toLocaleTimeString()}`);

    const prices = await getAllPrices();

    if (prices) {
      const profit = await scanAndTrade(flashLoan, token, prices);
      if (profit > 0) {
        totalProfit += profit;
        tradesExecuted++;
        console.log(`\n💰 Scan profit: ${profit} mUSDC | Total: ${totalProfit} mUSDC`);
      }
    }

    if (scanCount >= 10) {
      console.log("\n─────────────────────────────────────────────");
      console.log("🏁 BOT SUMMARY");
      console.log("─────────────────────────────────────────────");
      console.log(`Total scans:      ${scanCount}`);
      console.log(`Trades executed:  ${tradesExecuted}`);
      console.log(`Total profit:     ${totalProfit} mUSDC`);
      console.log("─────────────────────────────────────────────");
      return;
    }

    await sleep(15000);
    await scan();
  }

  await scan();
}

runRealBot().catch(console.error);