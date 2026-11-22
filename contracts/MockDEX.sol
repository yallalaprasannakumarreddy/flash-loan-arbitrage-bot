// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./MockProvider.sol";

// DEX A sells token at price 1.00
contract DEX_A {
    MockToken public token;
    
    constructor(address _token) {
        token = MockToken(_token);
    }

    // Buy token with ETH equivalent (we simulate with another token)
    function buyToken(uint256 usdcAmount) external returns (uint256) {
        // Price: 1 TOKEN = 1.00 USDC (normal price)
        uint256 tokenOut = usdcAmount * 100 / 100;
        token.transferFrom(msg.sender, address(this), usdcAmount);
        token.transfer(msg.sender, tokenOut);
        return tokenOut;
    }

    function sellToken(uint256 tokenAmount) external returns (uint256) {
        uint256 usdcOut = tokenAmount * 100 / 100;
        token.transferFrom(msg.sender, address(this), tokenAmount);
        token.transfer(msg.sender, usdcOut);
        return usdcOut;
    }
}

// DEX B sells token at price 1.01 (1% higher — arbitrage opportunity!)
contract DEX_B {
    MockToken public token;

    constructor(address _token) {
        token = MockToken(_token);
    }

    function buyToken(uint256 usdcAmount) external returns (uint256) {
        // Price: 1 TOKEN = 1.01 USDC (more expensive)
        uint256 tokenOut = usdcAmount * 100 / 101;
        token.transferFrom(msg.sender, address(this), usdcAmount);
        token.transfer(msg.sender, tokenOut);
        return tokenOut;
    }

    function sellToken(uint256 tokenAmount) external returns (uint256) {
        // Selling here gives 1.01 USDC per token
        uint256 usdcOut = tokenAmount * 101 / 100;
        token.transferFrom(msg.sender, address(this), tokenAmount);
        token.transfer(msg.sender, usdcOut);
        return usdcOut;
    }
}