const hre = require("hardhat");

// Simulated prices (in real world, fetch from DEX APIs)
let dexAPrices = { "mUSDC": 1.00 };
let dexBPrices = { "mUSDC": 1.00 };

// Minimum profit threshold (after gas fees)
const MIN_PROFIT_THRESHOLD = 100; // 100 mUSDC minimum profit
const BORROW_AMOUNT = 100000;     // Borrow 100,000 mUSDC each time
const GAS_COST_ESTIMATE = 50;     // Estimated gas cost in mUSDC

async function deployContracts() {
  const [owner] = await hre.ethers.getSigners();

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

  // Mint liquidity
  const million = hre.ethers.parseUnits("1000000", 6);
  const buffer = hre.ethers.parseUnits("10000", 6);
  await token.mint(await pool.getAddress(), million);
  await token.mint(await dexA.getAddress(), million);
  await token.mint(await dexB.getAddress(), million);
  await token.mint(await flashLoan.getAddress(), buffer);

  console.log("✅ All contracts deployed!");
  console.log("📍 FlashLoan:", await flashLoan.getAddress());
  console.log("📍 Token:", await token.getAddress());

  return { token, flashLoan, owner };
}

function simulateMarketPrices() {
  // Randomly change DEX B price to simulate market movements
  const change = (Math.random() - 0.4) * 0.03; // -1.2% to +1.8% change
  dexBPrices["mUSDC"] = parseFloat((1.00 + change).toFixed(4));
  dexAPrices["mUSDC"] = 1.00; // DEX A stays stable
}

function calculateProfit(dexAPrice, dexBPrice, borrowAmount) {
  // Buy on DEX A, sell on DEX B
  const tokensBought = borrowAmount / dexAPrice;
  const usdcReceived = tokensBought * dexBPrice;
  const grossProfit = usdcReceived - borrowAmount;
  const flashLoanFee = borrowAmount * 0.0005; // 0.05% fee
  const netProfit = grossProfit - flashLoanFee - GAS_COST_ESTIMATE;
  return { grossProfit, flashLoanFee, netProfit, tokensBought, usdcReceived };
}

async function runBot() {
  console.log("🤖 Flash Loan Arbitrage Bot Starting...\n");

  const { token, flashLoan, owner } = await deployContracts();
  const tokenAddress = await token.getAddress();

  let totalProfit = 0;
  let tradesExecuted = 0;
  let opportunitiesFound = 0;
  let scanCount = 0;

  console.log("\n🔍 Bot is scanning for arbitrage opportunities...");
  console.log("─────────────────────────────────────────────\n");

  // Scan every 3 seconds (simulating block time)
  const scanner = setInterval(async () => {
    scanCount++;

    // Simulate market price changes
    simulateMarketPrices();

    const dexAPrice = dexAPrices["mUSDC"];
    const dexBPrice = dexBPrices["mUSDC"];
    const { grossProfit, flashLoanFee, netProfit, tokensBought, usdcReceived } =
      calculateProfit(dexAPrice, dexBPrice, BORROW_AMOUNT);

    console.log(`📊 Scan #${scanCount} | DEX_A: $${dexAPrice.toFixed(4)} | DEX_B: $${dexBPrice.toFixed(4)} | Est. Profit: ${netProfit.toFixed(2)} mUSDC`);

    // Check if opportunity is profitable
    if (dexBPrice > dexAPrice && netProfit > MIN_PROFIT_THRESHOLD) {
      opportunitiesFound++;
      console.log(`\n🚨 OPPORTUNITY FOUND! #${opportunitiesFound}`);
      console.log(`   Buy on DEX_A at $${dexAPrice} → Sell on DEX_B at $${dexBPrice}`);
      console.log(`   Borrowing: ${BORROW_AMOUNT} mUSDC`);
      console.log(`   Expected profit: ${netProfit.toFixed(2)} mUSDC`);
      console.log(`   Executing flash loan...`);

      try {
        // Get balance before
        const balanceBefore = await token.balanceOf(await flashLoan.getAddress());

        // Execute flash loan
        const borrowAmountWei = hre.ethers.parseUnits(BORROW_AMOUNT.toString(), 6);
        await flashLoan.requestFlashLoan(tokenAddress, borrowAmountWei);

        // Get balance after
        const balanceAfter = await token.balanceOf(await flashLoan.getAddress());
        const actualProfit = balanceAfter - balanceBefore;
        const profitFormatted = parseFloat(hre.ethers.formatUnits(actualProfit, 6));

        totalProfit += profitFormatted;
        tradesExecuted++;

        console.log(`   ✅ Trade executed!`);
        console.log(`   Actual profit: ${profitFormatted} mUSDC`);
        console.log(`   Total profit so far: ${totalProfit} mUSDC`);
        console.log(`   Trades executed: ${tradesExecuted}\n`);

      } catch (err) {
        console.log(`   ❌ Trade failed: ${err.message}\n`);
      }
    }

    // Stop after 15 scans
    if (scanCount >= 15) {
      clearInterval(scanner);
      console.log("\n─────────────────────────────────────────────");
      console.log("🏁 BOT SUMMARY");
      console.log("─────────────────────────────────────────────");
      console.log(`Total scans:          ${scanCount}`);
      console.log(`Opportunities found:  ${opportunitiesFound}`);
      console.log(`Trades executed:      ${tradesExecuted}`);
      console.log(`Total profit:         ${totalProfit} mUSDC`);
      console.log("─────────────────────────────────────────────");
    }
  }, 3000);
}

runBot().catch(console.error);