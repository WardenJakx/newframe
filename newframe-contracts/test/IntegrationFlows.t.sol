// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {HarnessConfig} from "../src/HarnessConfig.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {TestContract} from "../src/TestContract.sol";

contract IntegrationFlowsTest is Test {
    MockUSDC private usdc;
    TestContract private testContract;

    function setUp() public {
        vm.deal(HarnessConfig.TEST_HARNESS_ACCOUNT, HarnessConfig.TEST_HARNESS_ETH_BALANCE);
        vm.etch(HarnessConfig.USDC, type(MockUSDC).runtimeCode);
        vm.etch(HarnessConfig.TEST_CONTRACT, type(TestContract).runtimeCode);

        usdc = MockUSDC(HarnessConfig.USDC);
        testContract = TestContract(payable(HarnessConfig.TEST_CONTRACT));

        usdc.mint(HarnessConfig.TEST_HARNESS_ACCOUNT, HarnessConfig.TEST_HARNESS_USDC_BALANCE);
    }

    function testHarnessAccountCanDepositEth() public {
        vm.prank(HarnessConfig.TEST_HARNESS_ACCOUNT);
        testContract.depositEth{value: 0.05 ether}("newframe eth integration flow");

        assertEq(testContract.ethDeposits(HarnessConfig.TEST_HARNESS_ACCOUNT), 0.05 ether);
    }

    function testHarnessAccountCanDepositUsdc() public {
        uint256 amount = 25e6;

        vm.startPrank(HarnessConfig.TEST_HARNESS_ACCOUNT);
        usdc.approve(address(testContract), amount);
        testContract.depositToken(HarnessConfig.USDC, amount, "newframe usdc integration flow");
        vm.stopPrank();

        assertEq(usdc.balanceOf(address(testContract)), amount);
        assertEq(testContract.tokenDeposits(HarnessConfig.USDC, HarnessConfig.TEST_HARNESS_ACCOUNT), amount);
    }
}

