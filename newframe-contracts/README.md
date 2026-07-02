# Newframe Contracts

Small Foundry harness project for local Newframe signing and transaction-flow review.

It gives us a deterministic Anvil chain with:

- harness account: `0x35f9179059a691d8beecf82fe112f7277e018588`
- MockUSDC etched at canonical mainnet USDC: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
- TestContract etched at: `0x0000000000000000000000000000000000001337`

## Setup

```sh
make setup
```

This starts Anvil on `127.0.0.1:8545` with `--block-time 1`, funds the harness account with 100 ETH, etches the mock contracts, and mints seeded USDC.

Run local Foundry tests:

```sh
make test
```

Verify the live Anvil setup without Newframe:

```sh
make smoke-direct
```

## Newframe Flow

Start Newframe separately, then run one of the integration targets:

```sh
make integration-eth
make integration-usdc
```

The integration targets first make sure Newframe knows the local Anvil chain. If chain `31337` is missing, they request `wallet_addEthereumChain`; approve the prompt in Newframe, then the transaction request continues.

To only add/switch the local chain without sending a flow transaction:

```sh
make ensure-newframe-chain
```

Both targets use Newframe's RPC proxy at `http://127.0.0.1:1248?chainId=31337` with `cast --unlocked`, so Newframe receives `eth_sendTransaction` requests and presents the wallet UI.

Useful direct checks:

```sh
make verify-seed
cast call 0x0000000000000000000000000000000000001337 "ethDeposits(address)(uint256)" 0x35f9179059a691d8beecf82fe112f7277e018588 --rpc-url http://127.0.0.1:8545
```
