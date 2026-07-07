// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract WETH9 {
    mapping(address account => uint256 amount) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Deposit(address indexed dst, uint256 wad);
    event Withdrawal(address indexed src, uint256 wad);

    receive() external payable {
        deposit();
    }

    function name() external pure returns (string memory) {
        return "Wrapped Ether";
    }

    function symbol() external pure returns (string memory) {
        return "WETH";
    }

    function decimals() external pure returns (uint8) {
        return 18;
    }

    function totalSupply() external view returns (uint256) {
        return address(this).balance;
    }

    function deposit() public payable {
        balanceOf[msg.sender] += msg.value;

        emit Deposit(msg.sender, msg.value);
        emit Transfer(address(0), msg.sender, msg.value);
    }

    function withdraw(uint256 wad) external {
        require(balanceOf[msg.sender] >= wad, "WETH9: insufficient balance");

        balanceOf[msg.sender] -= wad;

        emit Withdrawal(msg.sender, wad);
        emit Transfer(msg.sender, address(0), wad);

        (bool sent,) = payable(msg.sender).call{value: wad}("");
        require(sent, "WETH9: ETH transfer failed");
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;

        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (from != msg.sender) {
            uint256 currentAllowance = allowance[from][msg.sender];
            require(currentAllowance >= amount, "WETH9: insufficient allowance");

            if (currentAllowance != type(uint256).max) {
                allowance[from][msg.sender] = currentAllowance - amount;
                emit Approval(from, msg.sender, allowance[from][msg.sender]);
            }
        }

        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(to != address(0), "WETH9: transfer to zero");
        require(balanceOf[from] >= amount, "WETH9: insufficient balance");

        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        emit Transfer(from, to, amount);
    }
}
