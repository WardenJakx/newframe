# Newframe Contracts

Small Foundry harness project for local Newframe signing and transaction-flow review.

It gives us a deterministic Anvil chain with:

- harness account: `0x35f9179059a691d8beecf82fe112f7277e018588`
- MockUSDC etched at canonical mainnet USDC: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
- TestContract etched at: `0x0000000000000000000000000000000000001337`

## Setup

Anvil startup and seeding are owned by the TypeScript harness definitions. The regular and visual
harnesses both start the same managed Anvil service, build the contracts, etch the mocks, and seed
the configured balances before launching their workflows.

Start the regular harness from `apps/newframe/`:

```sh
bun run harness:newframe
```

Or start the visual harness from the repository root:

```sh
bun run visual:harness:newframe
```

Both start Anvil on `127.0.0.1:8545` with `--block-time 1`, fund the harness account with 100 ETH,
etch the mock contracts, and seed USDC and WETH liquidity.

The TypeScript harness definitions are the only supported way to manage this local Anvil setup and
run the Newframe integration flows.

For standalone contract development, run Foundry directly from `newframe-contracts/`:

```sh
forge build
forge test
```
