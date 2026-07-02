// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library HarnessConfig {
    address internal constant TEST_HARNESS_ACCOUNT = 0x35f9179059A691D8BEECf82Fe112F7277E018588;
    address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address internal constant TEST_CONTRACT = 0x0000000000000000000000000000000000001337;

    uint256 internal constant TEST_HARNESS_ETH_BALANCE = 100 ether;
    uint256 internal constant TEST_HARNESS_USDC_BALANCE = 1_000_000e6;
}

