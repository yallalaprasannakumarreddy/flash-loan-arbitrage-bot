const hre = require("hardhat");

async function main() {
  const [owner] = await hre.ethers.getSigners();
  console.log("Deploying with:", owner.address);

  // Deploy mock token
  const MockToken = await hre.ethers.getContractFactory("MockToken");
  const token = await MockToken.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("MockToken deployed to:", tokenAddress);

  // Deploy mock pool
  const MockPool = await hre.ethers.getContractFactory("MockPool");
  const pool = await MockPool.deploy();
  await pool.waitForDeployment();
  const poolAddress = await pool.getAddress();
  console.log("MockPool deployed to:", poolAddress);

  // Deploy mock address provider
  const MockAddressProvider = await hre.ethers.getContractFactory("MockAddressProvider");
  const provider = await MockAddressProvider.deploy();
  await provider.waitForDeployment();
  const providerAddress = await provider.getAddress();
  await provider.setPoolAddress(poolAddress);
  console.log("MockAddressProvider deployed to:", providerAddress);

  // Deploy DEX A and DEX B
  const DEX_A = await hre.ethers.getContractFactory("DEX_A");
  const dexA = await DEX_A.deploy(tokenAddress);
  await dexA.waitForDeployment();
  const dexAAddress = await dexA.getAddress();
  console.log("DEX_A deployed to:", dexAAddress);

  const DEX_B = await hre.ethers.getContractFactory("DEX_B");
  const dexB = await DEX_B.deploy(tokenAddress);
  await dexB.waitForDeployment();
  const dexBAddress = await dexB.getAddress();
  console.log("DEX_B deployed to:", dexBAddress);

  // Deploy FlashLoan contract
  const FlashLoan = await hre.ethers.getContractFactory("FlashLoan");
  const flashLoan = await FlashLoan.deploy(providerAddress);
  await flashLoan.waitForDeployment();
  const flashLoanAddress = await flashLoan.getAddress();
  console.log("FlashLoan deployed to:", flashLoanAddress);

  // Link DEXes to FlashLoan
  await flashLoan.setDEXes(dexAAddress, dexBAddress, tokenAddress);
  console.log("DEXes linked to FlashLoan");

  // Mint liquidity
  const million = hre.ethers.parseUnits("1000000", 6);
  const thousand = hre.ethers.parseUnits("10000", 6);

  await token.mint(poolAddress, million);       // Pool liquidity
  await token.mint(dexAAddress, million);       // DEX A liquidity
  await token.mint(dexBAddress, million);       // DEX B liquidity
  await token.mint(flashLoanAddress, thousand); // Small buffer for fees

  console.log("\nLiquidity minted to all contracts");

  // Check balances before
  const ownerBefore = await token.balanceOf(owner.address);
  const flashBefore = await token.balanceOf(flashLoanAddress);
  console.log("\n--- BEFORE FLASH LOAN ---");
  console.log("FlashLoan balance:", hre.ethers.formatUnits(flashBefore, 6), "mUSDC");

  // Execute flash loan - borrow 100,000 mUSDC
  const borrowAmount = hre.ethers.parseUnits("100000", 6);
  console.log("\nRequesting flash loan of 100,000 mUSDC...");
  console.log("Strategy: Buy cheap on DEX_A → Sell high on DEX_B");
  await flashLoan.requestFlashLoan(tokenAddress, borrowAmount);

  // Check balances after
  const flashAfter = await token.balanceOf(flashLoanAddress);
  console.log("\n--- AFTER FLASH LOAN ---");
  console.log("FlashLoan balance:", hre.ethers.formatUnits(flashAfter, 6), "mUSDC");

  const profit = flashAfter - flashBefore;
  console.log("Profit made:", hre.ethers.formatUnits(profit, 6), "mUSDC");
  console.log("\n✅ Arbitrage flash loan completed!");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});