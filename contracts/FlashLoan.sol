// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {FlashLoanSimpleReceiverBase} from "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IERC20} from "@aave/core-v3/contracts/dependencies/openzeppelin/contracts/IERC20.sol";

interface IDEX {
    function buyToken(uint256 usdcAmount) external returns (uint256);
    function sellToken(uint256 tokenAmount) external returns (uint256);
}

interface IToken {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

contract FlashLoan is FlashLoanSimpleReceiverBase {
    address public owner;
    address public dexA;
    address public dexB;
    address public token;

    constructor(address _addressProvider)
        FlashLoanSimpleReceiverBase(IPoolAddressesProvider(_addressProvider))
    {
        owner = msg.sender;
    }

    function setDEXes(address _dexA, address _dexB, address _token) external {
        require(msg.sender == owner, "Not owner");
        dexA = _dexA;
        dexB = _dexB;
        token = _token;
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {

        // ===== ARBITRAGE LOGIC =====
        // Step 1: Buy cheap on DEX A
        IToken(asset).approve(dexA, amount);
        uint256 tokensBought = IDEX(dexA).buyToken(amount);

        // Step 2: Sell high on DEX B
        IToken(asset).approve(dexB, tokensBought);
        uint256 usdcReceived = IDEX(dexB).sellToken(tokensBought);

        // Step 3: Repay flash loan
        uint256 totalRepayment = amount + premium;
        IToken(asset).approve(address(POOL), totalRepayment);

        return true;
    }

    function requestFlashLoan(address _token, uint256 _amount) public {
        POOL.flashLoanSimple(address(this), _token, _amount, "", 0);
    }

    function getBalance() public view returns (uint256) {
        return IToken(token).balanceOf(address(this));
    }

    function withdraw(address _token) public {
        require(msg.sender == owner, "Not owner");
        IToken(_token).transfer(owner, IToken(_token).balanceOf(address(this)));
    }
}