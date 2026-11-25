const hre = require("hardhat");

async function main() {
  const [owner] = await hre.ethers.getSigners();
  console.log("Deploying with:", owner.address);
  
  const balance = await hre.ethers.provider.getBalance(owner.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH");

  // Deploy only FlashLoan contract with Aave's real Sepolia address
  // Aave V3 Pool Address Provider on Sepolia
  const AAVE_POOL_PROVIDER = "0x012bAC54348C0E635dCAc9D5FB99f06F24136C9A";

  const FlashLoan = await hre.ethers.getContractFactory("FlashLoan");
  const flashLoan = await FlashLoan.deploy(AAVE_POOL_PROVIDER);
  await flashLoan.waitForDeployment();

  console.log("✅ FlashLoan deployed to:", await flashLoan.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});