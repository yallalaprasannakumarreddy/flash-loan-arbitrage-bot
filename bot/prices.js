const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function getPrice(coinId) {
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`
    );
    const data = await response.json();
    return data[coinId].usd;
  } catch (err) {
    console.error(`Error fetching ${coinId}:`, err.message);
    return null;
  }
}

async function checkArbitrageOpportunity() {
  console.log("🔍 Fetching real crypto prices from CoinGecko...\n");

  // Fetch real prices
  const ethPrice = await getPrice("ethereum");
  const wbtcPrice = await getPrice("wrapped-bitcoin");
  const bnbPrice = await getPrice("binancecoin");
  const maticPrice = await getPrice("matic-network");

  console.log(`ETH:   $${ethPrice}`);
  console.log(`WBTC:  $${wbtcPrice}`);
  console.log(`BNB:   $${bnbPrice}`);
  console.log(`MATIC: $${maticPrice}`);

  // Simulate DEX price difference (in reality DEXes have slight differences)
  const slippage = 0.003; // 0.3% typical DEX slippage

  console.log("\n📊 Simulated DEX Price Comparison:");
  console.log("─────────────────────────────────────────");

  const tokens = [
    { name: "ETH", price: ethPrice },
    { name: "WBTC", price: wbtcPrice },
    { name: "BNB", price: bnbPrice },
    { name: "MATIC", price: maticPrice }
  ];

  for (const token of tokens) {
    if (!token.price) continue;

    // Simulate slight price difference between Uniswap and Sushiswap
    const uniswapPrice = token.price * (1 + (Math.random() - 0.5) * slippage);
    const sushiswapPrice = token.price * (1 + (Math.random() - 0.5) * slippage);
    const diff = Math.abs(uniswapPrice - sushiswapPrice);
    const diffPercent = (diff / uniswapPrice * 100).toFixed(4);

    console.log(`\n${token.name}: $${token.price}`);
    console.log(`  Uniswap:   $${uniswapPrice.toFixed(4)}`);
    console.log(`  Sushiswap: $${sushiswapPrice.toFixed(4)}`);
    console.log(`  Difference: ${diffPercent}%`);

    if (diffPercent > 0.1) {
      const direction = uniswapPrice < sushiswapPrice
        ? "Buy Uniswap → Sell Sushiswap"
        : "Buy Sushiswap → Sell Uniswap";
      console.log(`  🚨 OPPORTUNITY: ${direction}`);
    } else {
      console.log(`  ❌ No opportunity`);
    }
  }
}

checkArbitrageOpportunity();