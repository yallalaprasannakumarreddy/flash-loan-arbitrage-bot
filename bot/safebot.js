const hre = require("hardhat");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// ===== RISK MANAGEMENT CONFIG =====
const CONFIG = {
  MAX_LOSS_PER_TRADE:   500,    // Stop if single trade loses >500 mUSDC
  MAX_DAILY_LOSS:       3000,   // Stop bot if total loss exceeds 3000 mUSDC
  MAX_TRADES_PER_SCAN:  2,      // Max 2 trades per scan
  MIN_PROFIT_PERCENT:   0.15,   // Min 0.15% price difference
  GAS_COST_USD:         50,     // Estimated gas cost
  BORROW_AMOUNT_USD:    100000, // Borrow amount
  MAX_CONSECUTIVE_FAILS: 3,     // Stop after 3 consecutive failures
  TAKE_PROFIT_TARGET:   10000,  // Stop bot after 10,000 mUSDC profit
};

// ===== BOT STATE =====
let state = {
  totalProfit:      0,
  totalLoss:        0,
  tradesExecuted:   0,
  tradesFailed:     0,
  scansCompleted:   0,
  consecutiveFails: 0,
  isRunning:        true,
  stopReason:       null,
  tradeLog:         []
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function checkRiskLimits() {
  if (state.totalLoss >= CONFIG.MAX_DAILY_LOSS) {
    state.isRunning = false;
    state.stopReason = `❌ Max daily loss reached: ${state.totalLoss} mUSDC`;
    return false;
  }
  if (state.consecutiveFails >= CONFIG.MAX_CONSECUTIVE_FAILS) {
    state.isRunning = false;
    state.stopReason = `❌ ${CONFIG.MAX_CONSECUTIVE_FAILS} consecutive failures — stopping`;
    return false;
  }
  if (state.totalProfit >= CONFIG.TAKE_PROFIT_TARGET) {
    state.isRunning = false;
    state.stopReason = `✅ Take profit target reached: ${state.totalProfit} mUSDC`;
    return false;
  }
  return true;
}

async function getAllPrices() {
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=ethereum,wrapped-bitcoin,binancecoin,matic-network,solana,avalanche-2,chainlink,uniswap,dogecoin&vs_currencies=usd`,
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
      LINK:  data["chainlink"]?.usd || null,
      UNI:   data["uniswap"]?.usd || null,
      DOGE:  data["dogecoin"]?.usd || null
    };
  } catch {
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

async function executeTrade(flashLoan, token, name, diffPercent, direction) {
  const balanceBefore = await token.balanceOf(await flashLoan.getAddress());

  try {
    await flashLoan.requestFlashLoan(
      await token.getAddress(),
      hre.ethers.parseUnits("100000", 6)
    );

    const balanceAfter = await token.balanceOf(await flashLoan.getAddress());
    const profit = parseFloat(hre.ethers.formatUnits(balanceAfter - balanceBefore, 6));

    if (profit < -CONFIG.MAX_LOSS_PER_TRADE) {
      state.totalLoss += Math.abs(profit);
      state.consecutiveFails++;
      console.log(`   🛑 STOP LOSS triggered! Loss: ${profit} mUSDC`);
      state.tradeLog.push({ name, profit, status: 'STOP_LOSS', direction });
      return profit;
    }

    state.totalProfit += profit;
    state.tradesExecuted++;
    state.consecutiveFails = 0;
    state.tradeLog.push({ name, profit, status: 'SUCCESS', direction });
    return profit;

  } catch (err) {
    state.tradesFailed++;
    state.consecutiveFails++;
    state.totalLoss += CONFIG.GAS_COST_USD;
    console.log(`   ❌ Trade failed: ${err.message}`);
    state.tradeLog.push({ name, profit: -CONFIG.GAS_COST_USD, status: 'FAILED', direction });
    return -CONFIG.GAS_COST_USD;
  }
}

async function runSafeBot() {
  console.log("🛡️  SAFE Flash Loan Bot — With Risk Management");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Risk Config:");
  console.log(`  Max loss per trade:    ${CONFIG.MAX_LOSS_PER_TRADE} mUSDC`);
  console.log(`  Max daily loss:        ${CONFIG.MAX_DAILY_LOSS} mUSDC`);
  console.log(`  Take profit target:    ${CONFIG.TAKE_PROFIT_TARGET} mUSDC`);
  console.log(`  Max consecutive fails: ${CONFIG.MAX_CONSECUTIVE_FAILS}`);
  console.log(`  Max trades per scan:   ${CONFIG.MAX_TRADES_PER_SCAN}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("Deploying contracts...");
  const { token, flashLoan } = await deployContracts();
  console.log("✅ Contracts deployed!\n");

  for (let scan = 1; scan <= 10; scan++) {
    if (!state.isRunning) break;
    if (!checkRiskLimits()) break;

    state.scansCompleted++;
    console.log(`\n📊 Scan #${scan} — ${new Date().toLocaleTimeString()}`);
    console.log(`   💰 Profit: ${state.totalProfit} | Loss: ${state.totalLoss} | Fails: ${state.consecutiveFails}`);

    const prices = await getAllPrices();
    if (!prices) {
      console.log("   ⚠️ Price fetch failed");
      await sleep(15000);
      continue;
    }

    let tradesThisScan = 0;

    for (const [name, price] of Object.entries(prices)) {
      if (!price) continue;
      if (!state.isRunning) break;
      if (!checkRiskLimits()) break;
      if (tradesThisScan >= CONFIG.MAX_TRADES_PER_SCAN) {
        console.log(`   ⏸️  Max trades per scan reached (${CONFIG.MAX_TRADES_PER_SCAN})`);
        break;
      }

      const slippage = 0.003;
      const uniPrice = price * (1 + (Math.random() - 0.5) * slippage);
      const sushiPrice = price * (1 + (Math.random() - 0.5) * slippage);
      const diffPercent = Math.abs(uniPrice - sushiPrice) / uniPrice * 100;
      const netProfit = (100000 * diffPercent / 100) - (100000 * 0.0005) - CONFIG.GAS_COST_USD;
      const direction = uniPrice < sushiPrice ? "Uni→Sushi" : "Sushi→Uni";

      console.log(`   ${name}: $${price.toFixed(2)} | Diff: ${diffPercent.toFixed(4)}% | Est: $${netProfit.toFixed(0)}`);

      if (diffPercent > CONFIG.MIN_PROFIT_PERCENT && netProfit > 0) {
        console.log(`   🚨 Trading ${name} — ${direction}`);
        const profit = await executeTrade(flashLoan, token, name, diffPercent, direction);
        console.log(`   ${profit > 0 ? '✅' : '❌'} Result: ${profit} mUSDC`);
        tradesThisScan++;
      }
    }

    if (scan < 10 && state.isRunning) await sleep(15000);
  }

  // Final report
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🏁 SAFE BOT FINAL REPORT");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (state.stopReason) console.log(`Stop reason: ${state.stopReason}`);
  console.log(`Scans completed:    ${state.scansCompleted}`);
  console.log(`Trades executed:    ${state.tradesExecuted}`);
  console.log(`Trades failed:      ${state.tradesFailed}`);
  console.log(`Total profit:       ${state.totalProfit} mUSDC`);
  console.log(`Total loss:         ${state.totalLoss} mUSDC`);
  console.log(`Net profit:         ${state.totalProfit - state.totalLoss} mUSDC`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

runSafeBot().catch(console.error);