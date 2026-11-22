// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IERC20} from "@aave/core-v3/contracts/dependencies/openzeppelin/contracts/IERC20.sol";

contract MockToken {
    string public name = "Mock USDC";
    string public symbol = "mUSDC";
    uint8 public decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

contract MockPool {
    uint256 public premium = 5; // 0.05% fee

    function flashLoanSimple(
        address receiver,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16
    ) external {
        // Send tokens to receiver
        MockToken(asset).transfer(receiver, amount);

        // Calculate fee
        uint256 fee = (amount * premium) / 10000;

        // Call executeOperation on receiver
        IFlashLoanReceiver(receiver).executeOperation(
            asset, amount, fee, msg.sender, params
        );

        // Take back loan + fee
        MockToken(asset).transferFrom(receiver, address(this), amount + fee);
    }
}

interface IFlashLoanReceiver {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

contract MockAddressProvider is IPoolAddressesProvider {
    address public poolAddress;

    function setPoolAddress(address _pool) external {
        poolAddress = _pool;
    }

    function getPool() external view override returns (address) { return poolAddress; }
    function getMarketId() external pure override returns (string memory) { return "mock"; }
    function setMarketId(string calldata) external override {}
    function getAddress(bytes32) external pure override returns (address) { return address(0); }
    function setAddressAsProxy(bytes32, address) external override {}
    function setAddress(bytes32, address) external override {}
    function getPoolConfigurator() external pure override returns (address) { return address(0); }
    function setPoolConfiguratorImpl(address) external override {}
    function getPriceOracle() external pure override returns (address) { return address(0); }
    function setPriceOracle(address) external override {}
    function getACLManager() external pure override returns (address) { return address(0); }
    function setACLManager(address) external override {}
    function getACLAdmin() external pure override returns (address) { return address(0); }
    function setACLAdmin(address) external override {}
    function getPriceOracleSentinel() external pure override returns (address) { return address(0); }
    function setPriceOracleSentinel(address) external override {}
    function getPoolDataProvider() external pure override returns (address) { return address(0); }
    function setPoolDataProvider(address) external override {}
    function setPoolImpl(address) external override {}
}