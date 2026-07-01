// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";

import {HarnessConfig} from "../src/HarnessConfig.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {TestContract} from "../src/TestContract.sol";

contract SeedAnvil is Script {
    function run() external {
        vm.deal(HarnessConfig.TEST_HARNESS_ACCOUNT, HarnessConfig.TEST_HARNESS_ETH_BALANCE);
        vm.etch(HarnessConfig.USDC, type(MockUSDC).runtimeCode);
        vm.etch(HarnessConfig.TEST_CONTRACT, type(TestContract).runtimeCode);

        MockUSDC(HarnessConfig.USDC).mint(HarnessConfig.TEST_HARNESS_ACCOUNT, HarnessConfig.TEST_HARNESS_USDC_BALANCE);
    }
}

