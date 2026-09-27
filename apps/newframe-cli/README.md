# newframe-cli

`newframe-cli` lets a local agent request one Newframe wallet session, keep its bearer token on disk, and use Flash without handling signatures itself. Newframe must be running with an unlocked, selected Seed or Ring wallet that has AI access enabled. The user approves the initial session in Newframe.

Run from this repo with `bun apps/newframe-cli/src/index.ts`. To install the `newframe` command locally, run `bun link` in `apps/newframe-cli`, then `bun link newframe-cli` where you use it. Every command prints JSON. Errors print JSON to stderr and exit nonzero.

```sh
newframe session start --name "Trading Agent" --duration 600
newframe session show
newframe rpc eth_sendTransaction --chain-id 31337 --params '[{"from":"0xYOUR_APPROVED_ACCOUNT","to":"0x000000000000000000000000000000000000a11c","value":"0x1","chainId":"0x7a69"}]'
newframe session revoke
```

`session start` waits for the approval prompt. It prints the session ID, account, and expiration. It refuses to replace an active session; revoke it first. After Newframe restarts, it detects the stale token and requests a new session without printing either token. `session revoke` clears a stale local token when Newframe returns 401. The CLI stores the token in `$NEWFRAME_CLI_STATE_DIR/session.json`, or `$XDG_STATE_HOME/newframe-cli/session.json`, or `~/.local/state/newframe-cli/session.json`. It creates the directory with mode `0700` and atomically writes the file with mode `0600`. Sessions expire and are also invalidated when Newframe restarts.

## Flash

Create a request file with complete Flash asset objects. This example quotes selling WETH for USDC on local Anvil. The `accountAddress` may be omitted; the CLI uses the approved session account.

```json
{
  "targetAsset": {
    "id": "31337:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    "symbol": "WETH",
    "name": "Wrapped Ether",
    "decimals": 18,
    "chainId": 31337,
    "isNative": false,
    "address": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
  },
  "contraAsset": {
    "id": "31337:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    "symbol": "USDC",
    "name": "USD Coin",
    "decimals": 6,
    "chainId": 31337,
    "isNative": false,
    "address": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
  },
  "side": "sell",
  "qty": "1",
  "slippage": "0.5"
}
```

```sh
newframe flash quote --request request.json --out quote.json
newframe flash submit --quote quote.json
newframe flash orders
newframe flash orders --status accepted,pending --page-size 50
newframe flash order ORDER_ID
newframe flash watch ORDER_ID --timeout 600
newframe flash cancel ORDER_ID
```

The quote file contains `{ "request", "quote", "flash" }`: the account-bound request, normalized quote, and original Flash payload. Quoting calls Flash directly and does not sign. Submission checks the account, chain, and quote expiration. It sends any quoted wrap or approval transactions through the agent session, waits for their receipts, signs permit and order typed data through the session, then submits to Flash with an idempotency key. `flash watch` polls until a terminal status. `flash cancel` signs Flash's cancel message through the same session.

Submission progress is saved privately per quote in the CLI state directory. If receipt polling fails or the process stops after receiving a transaction hash, rerun `flash submit --quote quote.json`; it waits for the same transaction instead of sending it again. Once Flash returns an order ID, later reruns return that ID. A per-quote lock rejects concurrent submissions. If the process stops during an `eth_sendTransaction` call before the hash is saved, the CLI reports an unknown broadcast outcome and requires chain inspection before any retry.

Use `-` instead of a request or quote filename to read JSON from stdin. `--out` refuses to overwrite an existing file. `rpc METHOD` accepts a JSON array or filename with `--params`; the CLI prints `{ "result": ... }`.

Environment overrides:

| Variable                 | Default                         | Purpose                             |
| ------------------------ | ------------------------------- | ----------------------------------- |
| `NEWFRAME_RPC_URL`       | `http://127.0.0.1:1248`         | Newframe local API base URL         |
| `NEWFRAME_FLASH_URL`     | Newframe's production Flash URL | Flash API base URL, including `/v1` |
| `NEWFRAME_CLI_STATE_DIR` | User state directory            | Private session storage             |

For a local Flash fixture, set `NEWFRAME_FLASH_URL=http://127.0.0.1:8422/v1`; the CLI uses Newframe's dev Flash profile for Anvil support. Production Flash requests use the same API headers as Newframe's renderer integration.
