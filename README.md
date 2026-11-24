# Flash Loan Arbitrage Bot

A DeFi flash loan arbitrage bot built with Solidity and Hardhat.

## What it does
- Borrows millions in crypto with zero collateral using Aave flash loans
- Detects price differences between DEX A and DEX B
- Automatically executes arbitrage trades for profit
- Repays the loan in the same transaction

## Tech Stack
- Solidity (Smart Contracts)
- Hardhat (Development Framework)
- Ethers.js (Blockchain Interaction)
- Node.js (Bot)

## Results
- Bot scanned 15 market opportunities
- Found 4 profitable trades
- Total profit: 3,800 mUSDC

## How to run
```bash
npm install
npx hardhat compile
node bot/index.js
```