const hre = require("hardhat");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// ⚡ Fast bot - reacts to every new block
const MIN_PROFIT_PERCENT = 0.15;
const GAS_COST_USD = 50;
const BORROW_AMOUNT_USD = 100000;

let isExecuting = false; // Prevent overlapping trades
let blockCount = 0;
let totalProfit = 0;
let tradesExecuted = 0;

async function getAllPrices() {
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=ethereum,wrapped-bitcoin,binancecoin,matic-network&vs_currencies=usd`,
      { headers: { "Accept": "application/json" } }
    );
    const data = await response.json();
    return {
      ETH:   data["ethereum"]?.usd || null,
      WBTC:  data["wrapped-bitcoin"]?.usd || null,
      BNB:   data["binancecoin"]?.usd || null,
      MATIC: data["matic-network"]?.usd || null
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

async function checkAndTrade(flashLoan, token, prices) {
  if (isExecuting) return; // Skip if already trading

  for (const [name, price] of Object.entries(prices)) {
    if (!price) continue;

    const slippage = 0.003;
    const uniswapPrice = price * (1 + (Math.random() - 0.5) * slippage);
    const sushiswapPrice = price * (1 + (Math.random() - 0.5) * slippage);
    const diffPercent = Math.abs(uniswapPrice - sushiswapPrice) / uniswapPrice * 100;
    const grossProfit = BORROW_AMOUNT_USD * (diffPercent / 100);
    const netProfit = grossProfit - (BORROW_AMOUNT_USD * 0.0005) - GAS_COST_USD;

    if (diffPercent > MIN_PROFIT_PERCENT && netProfit > 0) {
      isExecuting = true;
      const direction = uniswapPrice < sushiswapPrice ? "Uni→Sushi" : "Sushi→Uni";
      console.log(`   ⚡ ${name}: ${diffPercent.toFixed(4)}% diff | $${netProfit.toFixed(0)} profit | ${direction}`);

      try {
        const tokenAddress = await token.getAddress();
        const balanceBefore = await token.balanceOf(await flashLoan.getAddress());
        await flashLoan.requestFlashLoan(tokenAddress, hre.ethers.parseUnits("100000", 6));
        const balanceAfter = await token.balanceOf(await flashLoan.getAddress());
        const profit = parseFloat(hre.ethers.formatUnits(balanceAfter - balanceBefore, 6));
        totalProfit += profit;
        tradesExecuted++;
        console.log(`   ✅ Executed! Profit: ${profit} mUSDC | Total: ${totalProfit} mUSDC`);
      } catch (err) {
        console.log(`   ❌ Failed: ${err.message}`);
      } finally {
        isExecuting = false;
      }
      break; // One trade per block
    }
  }
}

async function runFastBot() {
  console.log("⚡ FAST Flash Loan Bot - Block-by-Block Scanner");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("Deploying contracts...");
  const { token, flashLoan } = await deployContracts();
  console.log("✅ Ready!\n");

  // Simulate new block every 2 seconds (Ethereum = 12 sec, we simulate faster)
  const blockSimulator = setInterval(async () => {
    blockCount++;

    // Fetch prices every 3 blocks to avoid rate limiting
    if (blockCount % 3 === 1) {
      process.stdout.write(`📦 Block #${blockCount} | Fetching prices...`);
      const prices = await getAllPrices();

      if (prices) {
        const validPrices = Object.entries(prices).filter(([,v]) => v).length;
        console.log(` Got ${validPrices} prices`);
        await checkAndTrade(flashLoan, token, prices);
      } else {
        console.log(` Failed`);
      }
    } else {
      console.log(`📦 Block #${blockCount} | Using cached prices`);
    }

    // Stop after 20 blocks
    if (blockCount >= 20) {
      clearInterval(blockSimulator);
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("🏁 FAST BOT SUMMARY");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`Blocks scanned:   ${blockCount}`);
      console.log(`Trades executed:  ${tradesExecuted}`);
      console.log(`Total profit:     ${totalProfit} mUSDC`);
      console.log(`Avg per trade:    ${tradesExecuted > 0 ? (totalProfit/tradesExecuted).toFixed(0) : 0} mUSDC`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    }
  }, 2000);
}

runFastBot().catch(console.error);