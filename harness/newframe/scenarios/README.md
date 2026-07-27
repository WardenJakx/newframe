# Newframe operator scenarios

These scripts exercise a separately running Newframe instance. They may open approval prompts,
submit transactions, mutate the active profile, or depend on live services. They are useful for
manual investigation, but they are not deterministic automated tests and are not included in
`test:unit` or `test:all`.

Use `bun run visual:harness:newframe` for the authoritative assembled Electron acceptance suite. It
owns its local services, compiled application, harness state, assertions, evidence, and cleanup.

## Prerequisites

1. Start Newframe and any chain or service required by the selected scenario.
2. Confirm the Newframe RPC endpoint is available at `127.0.0.1:1248`.
3. Expect to approve wallet requests in the tray unless the scenario says otherwise.
4. Use a disposable development profile. Several scenarios mutate wallet or chain state.

Run a scenario from the repository root:

```sh
bun harness/newframe/scenarios/provider-smoke.ts
bun harness/newframe/scenarios/sign-typed-data.ts
bun harness/newframe/scenarios/switch-origin-chain.ts
```

`transaction-warning.ts` now exits unsuccessfully if the unsafe transaction is accepted. The old
test returned a boolean that Bun ignored, so both outcomes passed.

## Scenario ownership

- `agent-usdc.ts`: operator-approved agent session and USDC transfer.
- `deploy-contract.ts`: contract deployment through the provider.
- `provider-smoke.ts`: fixed-value send, personal signature, and raw signature recovery.
- `sign-typed-data.ts`: EIP-712 v4 signing and signer recovery.
- `sign-typed-data-legacy.ts`: exploratory legacy typed-data methods.
- `switch-origin-chain.ts`: origin-scoped chain switching.
- `transaction-warning.ts`: expected rejection of an unsafe mainnet transaction.
- `websocket-smoke.ts`: basic JSON-RPC WebSocket connectivity.
