// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract TestContract {
    mapping(address account => uint256 amount) public ethDeposits;
    mapping(address token => mapping(address account => uint256 amount)) public tokenDeposits;

    event EthDeposited(address indexed account, uint256 amount, string memo);
    event TokenDeposited(address indexed token, address indexed account, uint256 amount, string memo);

    receive() external payable {
        ethDeposits[msg.sender] += msg.value;
        emit EthDeposited(msg.sender, msg.value, "receive");
    }

    function depositEth(string calldata memo) external payable {
        require(msg.value > 0, "TestContract: no ETH sent");

        ethDeposits[msg.sender] += msg.value;
        emit EthDeposited(msg.sender, msg.value, memo);
    }

    function depositToken(address token, uint256 amount, string calldata memo) external {
        require(amount > 0, "TestContract: no token amount");
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "TestContract: transfer failed");

        tokenDeposits[token][msg.sender] += amount;
        emit TokenDeposited(token, msg.sender, amount, memo);
    }
}

