// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library HarnessConfig {
    address internal constant TEST_HARNESS_ACCOUNT = 0x35f9179059A691D8BEECf82Fe112F7277E018588;
    address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address internal constant MOCK_FLASH_SETTLEMENT = 0x0000000000000000000000000000000000005E77;
    address internal constant TEST_CONTRACT = 0x0000000000000000000000000000000000001337;

    uint256 internal constant TEST_HARNESS_ETH_BALANCE = 100 ether;
    uint256 internal constant TEST_HARNESS_USDC_BALANCE = 1_000_000e6;
    uint256 internal constant TEST_HARNESS_WETH_BALANCE = 10 ether;
    uint256 internal constant MOCK_FLASH_SETTLEMENT_USDC_LIQUIDITY = 1_000_000e6;
    uint256 internal constant MOCK_FLASH_SETTLEMENT_WETH_LIQUIDITY = 100 ether;
}
