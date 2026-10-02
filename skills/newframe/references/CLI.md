# Newframe CLI

Use `bun <script-path> ...`, where `<script-path>` is the absolute path to `scripts/newframe.js` beside this skill. Bun and the Newframe desktop app must run on the same computer. The app listens at `http://127.0.0.1:1248` by default. Every command prints JSON; errors print JSON to stderr and exit nonzero.

## Session

Select an unlocked Seed or Ring wallet in Newframe and enable AI access in its Accounts menu. `session start` prompts the user once in Newframe. The returned `account` is the authorized wallet. Changing the selected wallet later does not change the session's account.

```sh
bun <script-path> session start --name "Trading Agent" --duration 3600
bun <script-path> session show
bun <script-path> session revoke
```

The CLI stores its token privately in `$NEWFRAME_CLI_STATE_DIR/session.json`, `$XDG_STATE_HOME/newframe-cli/session.json`, or `~/.local/state/newframe-cli/session.json`. It expires at the approved time or when Newframe restarts. Do not copy or print the token.

## Flash

Create a request JSON with verified chain IDs and token metadata. This example uses **local Anvil test assets only**:

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

The account address can be omitted; the CLI uses the approved session account. Optional fields include `orderType`, `limitNotionalPrice`, `maxPriceImpact`, `durationSeconds`, and triggers. Do not use the Anvil addresses for live trades.

```sh
bun <script-path> flash quote --request request.json --out quote.json
bun <script-path> flash submit --quote quote.json
bun <script-path> flash orders
bun <script-path> flash order ORDER_ID
bun <script-path> flash watch ORDER_ID --timeout 600
bun <script-path> flash cancel ORDER_ID
```

The quote file contains the account-bound request, normalized quote, and Flash payload. Quoting does not sign. Submission sends any quoted wrap or approval transactions, waits for receipts, signs permit and order data through Newframe, and submits to Flash. It saves progress per quote. If a run stops after a transaction hash is known, retry the same quote file. If it stops while broadcasting before a hash is saved, inspect the chain before retrying.

Use `-` instead of a request or quote filename to read JSON from stdin. `--out` refuses to overwrite a file. The CLI supports `NEWFRAME_RPC_URL`, `NEWFRAME_FLASH_URL`, and `NEWFRAME_CLI_STATE_DIR` overrides. `NEWFRAME_FLASH_URL=http://127.0.0.1:8422/v1` selects the local Flash fixture.

## Wallet RPC

Use `bun <script-path> rpc METHOD --params JSON_OR_FILE --chain-id ID`. Agent sessions permit `eth_sendTransaction`, `personal_sign`, `eth_signTypedData_v3` or `eth_signTypedData_v4`, and `wallet_getAssets`. `wallet_getAssets` takes no params and returns the authorized wallet's native and ERC-20 balances, even when another wallet is selected in Newframe. Balances older than five minutes are returned while Newframe refreshes them in the background. RPC parameters must be a JSON array. The CLI prints `{ "result": ... }`.
