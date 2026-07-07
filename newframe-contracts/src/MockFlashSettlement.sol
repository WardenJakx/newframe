// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {HarnessConfig} from "./HarnessConfig.sol";

interface ISettlementToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface ISettlementWETH is ISettlementToken {
    function withdraw(uint256 amount) external;
}

contract MockFlashSettlement {
    address internal constant NATIVE_ETH = address(0);

    event SwapExactInput(
        address indexed payer,
        address indexed recipient,
        address indexed inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 outputAmount
    );

    receive() external payable {}

    function swapExactInput(
        address payer,
        address recipient,
        address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 outputAmount
    ) external returns (uint256) {
        require(payer != address(0), "MockFlashSettlement: payer zero");
        require(recipient != address(0), "MockFlashSettlement: recipient zero");
        require(inputAmount > 0, "MockFlashSettlement: no input amount");
        require(outputAmount > 0, "MockFlashSettlement: no output amount");
        require(_isSupportedToken(inputToken), "MockFlashSettlement: unsupported input");
        require(outputToken == NATIVE_ETH || _isSupportedToken(outputToken), "MockFlashSettlement: unsupported output");

        require(
            ISettlementToken(inputToken).transferFrom(payer, address(this), inputAmount),
            "MockFlashSettlement: input transfer failed"
        );

        _sendOutput(recipient, outputToken, outputAmount);

        emit SwapExactInput(payer, recipient, inputToken, outputToken, inputAmount, outputAmount);
        return outputAmount;
    }

    function _sendOutput(address recipient, address outputToken, uint256 outputAmount) private {
        if (outputToken == NATIVE_ETH) {
            ISettlementWETH(HarnessConfig.WETH).withdraw(outputAmount);

            (bool sent,) = payable(recipient).call{value: outputAmount}("");
            require(sent, "MockFlashSettlement: native transfer failed");
            return;
        }

        require(
            ISettlementToken(outputToken).transfer(recipient, outputAmount),
            "MockFlashSettlement: output transfer failed"
        );
    }

    function _isSupportedToken(address token) private pure returns (bool) {
        return token == HarnessConfig.WETH || token == HarnessConfig.USDC;
    }
}
