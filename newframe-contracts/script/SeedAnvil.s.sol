// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";

import {HarnessConfig} from "../src/HarnessConfig.sol";
import {MockFlashSettlement} from "../src/MockFlashSettlement.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {TestContract} from "../src/TestContract.sol";
import {WETH9} from "../src/WETH9.sol";

contract SeedAnvil is Script {
    function run() external {
        vm.deal(HarnessConfig.TEST_HARNESS_ACCOUNT, HarnessConfig.TEST_HARNESS_ETH_BALANCE);
        vm.etch(HarnessConfig.USDC, type(MockUSDC).runtimeCode);
        vm.etch(HarnessConfig.WETH, type(WETH9).runtimeCode);
        vm.etch(HarnessConfig.MOCK_FLASH_SETTLEMENT, type(MockFlashSettlement).runtimeCode);
        vm.etch(HarnessConfig.TEST_CONTRACT, type(TestContract).runtimeCode);

        MockUSDC(HarnessConfig.USDC).mint(HarnessConfig.TEST_HARNESS_ACCOUNT, HarnessConfig.TEST_HARNESS_USDC_BALANCE);

        MockUSDC(HarnessConfig.USDC)
            .mint(HarnessConfig.MOCK_FLASH_SETTLEMENT, HarnessConfig.MOCK_FLASH_SETTLEMENT_USDC_LIQUIDITY);

        uint256 totalWethSeed =
            HarnessConfig.TEST_HARNESS_WETH_BALANCE + HarnessConfig.MOCK_FLASH_SETTLEMENT_WETH_LIQUIDITY;

        vm.deal(address(this), totalWethSeed);

        WETH9(payable(HarnessConfig.WETH)).deposit{value: totalWethSeed}();
        require(
            WETH9(payable(HarnessConfig.WETH))
                .transfer(HarnessConfig.TEST_HARNESS_ACCOUNT, HarnessConfig.TEST_HARNESS_WETH_BALANCE),
            "SeedAnvil: harness WETH transfer failed"
        );
        require(
            WETH9(payable(HarnessConfig.WETH))
                .transfer(HarnessConfig.MOCK_FLASH_SETTLEMENT, HarnessConfig.MOCK_FLASH_SETTLEMENT_WETH_LIQUIDITY),
            "SeedAnvil: settlement WETH transfer failed"
        );
    }
}
