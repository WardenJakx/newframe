# Newframe Desktop App

Newframe's desktop app works on macOS, Windows, and Linux. It exposes local JSON-RPC endpoints for native, command-line, and browser clients, and it works with the [Newframe Browser Extension](../newframe-extension/README.md) when a web app expects an injected provider.

For the full project overview, features, and surface map, start with the [root README](../../README.md).

## Download and get started

### Download the app

- Coming soon. Run from source for now
<!-- - [Production releases](https://github.com/wardenjakx/newframe/releases)
- [Canary releases](https://github.com/wardenjakx/newframe/releases)

After installing, open Newframe from your applications folder or app launcher. -->

### Run from source

On Ubuntu, install native build dependencies first:

```bash
sudo apt-get install build-essential libudev-dev
```

Then clone the repo and run the app:

```bash
git clone https://github.com/wardenjakx/newframe.git
cd newframe/apps/newframe
bun run setup
bun run dev
```

### Build locally

```bash
bun run bundle # Create the app bundle assets
bun run build # Build Newframe for the current platform
```

On macOS, you can build and install a local preview app:

```bash
bun run install:preview
```

## Usage

### Connect through the browser extension

The browser extension injects a Newframe-connected [EIP-1193](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1193.md) provider into web apps as `window.ethereum`. Use it when a site does not offer a native Newframe connection option.

### Connect to Newframe natively

Newframe exposes system-wide JSON-RPC endpoints at `http://127.0.0.1:1248` and `ws://127.0.0.1:1248`. Prefer HTTP for request/response JSON-RPC calls. Use WebSocket only when you need pushed subscription events such as account, chain, or asset changes.

### Use Newframe with CLI tools

Hardhat and Foundry use the same Newframe model:

- JSON-RPC endpoint: `http://127.0.0.1:1248?chainId=...`
- signer account: your selected Newframe account
- real network name and chain id: your app's normal chain config
- remote signing mode: send `eth_sendTransaction` to Newframe instead of signing locally

Newframe is the RPC and signing proxy, not the chain name. Keep your normal chain names such as `sepolia`, `mainnet`, or `anvil`; point those chain configs at Newframe with the matching `chainId` query parameter. If that chain already exists in Newframe, Newframe switches the calling origin to that chain and routes the request there. If the chain is not added yet, Newframe rejects the request; add it first with `wallet_addEthereumChain` or from the app.

#### Hardhat

Configure the real target network as an HTTP JSON-RPC network whose URL is Newframe. Hardhat will still treat the network as `sepolia` for chain-specific config and verification, but it will send reads and `eth_sendTransaction` through Newframe.

```ts
// hardhat.config.ts
import { defineConfig } from 'hardhat/config'
import hardhatEthers from '@nomicfoundation/hardhat-ethers'

export default defineConfig({
  plugins: [hardhatEthers],
  networks: {
    sepolia: {
      type: 'http',
      chainType: 'l1',
      url: 'http://127.0.0.1:1248?chainId=11155111',
      chainId: 11155111,
      accounts: 'remote',
      from: process.env.NEWFRAME_ACCOUNT || '',
      httpHeaders: {
        Origin: process.env.NEWFRAME_ORIGIN || 'hardhat'
      }
    }
  }
})
```

Run scripts against Newframe:

```bash
NEWFRAME_ACCOUNT=0xYourNewframeAccount \
npx hardhat run scripts/deploy.ts --network sepolia
```

#### Foundry

Foundry scripts need unlocked-account mode so Forge sends `eth_sendTransaction` instead of signing locally. Keep `--rpc-url` pointed at Newframe, and pass the real chain when a command needs chain-specific behavior such as verification.

```bash
export NEWFRAME_ACCOUNT=0xYourNewframeAccount
export NEWFRAME_RPC_URL="http://127.0.0.1:1248?chainId=11155111"

forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$NEWFRAME_RPC_URL" \
  --chain sepolia \
  --sender "$NEWFRAME_ACCOUNT" \
  --broadcast \
  --unlocked \
  --slow
```

For one-off Cast calls, use the same endpoint:

```bash
cast send 0xTargetAddress "setValue(uint256)" 123 \
  --rpc-url "$NEWFRAME_RPC_URL" \
  --chain sepolia \
  --from "$NEWFRAME_ACCOUNT" \
  --unlocked
```

### Give an AI agent autonomous access

AI agent sessions let a native local process sign and send transactions from one approved hot wallet without displaying another confirmation for every action. Ordinary requests sent to Newframe's standard HTTP RPC endpoint still require confirmation; autonomous requests must use the dedicated agent endpoint.

Only Seed and Ring hot wallets can be enabled for AI access. An agent session cannot discover other accounts, export a private key or recovery phrase, add a chain, or act on an account other than the one approved for its session.

#### 1. Enable an AI wallet

1. Unlock Newframe and open **Accounts**.
2. Open the account menu for the Seed or Ring wallet the agent should use.
3. Select **Enable AI access**. The account will display an **AI Wallet** tag.
4. Select that account before the agent requests its session.

The target chain must already be enabled in Newframe before the agent sends a transaction.

#### 2. Request a session

From the agent's native process or a terminal, send its descriptor and requested lifetime to the local agent API. The request remains open while it waits for the user to approve it in Newframe.

```bash
curl --silent --show-error \
  --request POST http://127.0.0.1:1248/agent/session \
  --header 'Content-Type: application/json' \
  --data '{
    "descriptor": {
      "name": "My Local Agent",
      "description": "Executes the strategy configured by the user"
    },
    "durationSeconds": 600
  }'
```

Do not send this request from browser JavaScript. Browser-originated agent requests are rejected.

Newframe displays the descriptor, wallet, and requested duration. After the user selects **Allow autonomous access**, the request returns credentials similar to:

```json
{
  "sessionId": "00000000-0000-0000-0000-000000000000",
  "sessionToken": "one-time-secret-token",
  "account": "0xYourApprovedAccount",
  "descriptor": {
    "name": "My Local Agent",
    "description": "Executes the strategy configured by the user"
  },
  "expiresAt": 1780000000000
}
```

The token is returned only when the session is created. Treat it like a password: keep it out of URLs, logs, source control, and prompts sent to unrelated services. Session durations must be between 60 seconds and 180 days. Sessions are currently stored in memory and are invalidated when Newframe restarts.

#### 3. Send an autonomous transaction

Pass both credentials on every request. The transaction's `from` address, when supplied, must match the account returned for the session. This example sends one wei on local Anvil (`31337`, or `0x7a69`):

```bash
export NEWFRAME_AGENT_SESSION='00000000-0000-0000-0000-000000000000'
export NEWFRAME_AGENT_TOKEN='one-time-secret-token'
export NEWFRAME_AGENT_ACCOUNT='0xYourApprovedAccount'

curl --silent --show-error \
  --request POST http://127.0.0.1:1248/agent/rpc \
  --header "Authorization: Bearer $NEWFRAME_AGENT_TOKEN" \
  --header "X-Newframe-Agent-Session: $NEWFRAME_AGENT_SESSION" \
  --header 'Content-Type: application/json' \
  --data "{
    \"id\": 1,
    \"jsonrpc\": \"2.0\",
    \"method\": \"eth_sendTransaction\",
    \"params\": [{
      \"from\": \"$NEWFRAME_AGENT_ACCOUNT\",
      \"to\": \"0x000000000000000000000000000000000000a11c\",
      \"chainId\": \"0x7a69\",
      \"value\": \"0x1\"
    }]
  }"
```

The same authenticated endpoint supports `personal_sign`, `eth_signTypedData`, `eth_signTypedData_v3`, and `eth_signTypedData_v4`. Newframe rejects unsupported methods, expired or revoked credentials, mismatched accounts, locked wallets, and wallets whose AI access has been disabled.

#### 4. Revoke access

The agent can revoke its own session:

```bash
curl --silent --show-error \
  --request DELETE "http://127.0.0.1:1248/agent/session/$NEWFRAME_AGENT_SESSION" \
  --header "Authorization: Bearer $NEWFRAME_AGENT_TOKEN" \
  --header "X-Newframe-Agent-Session: $NEWFRAME_AGENT_SESSION"
```

The user can also select **Revoke AI sessions** from the account menu. Disabling AI access for the wallet immediately revokes all of its sessions.

### Enable portfolio discovery

To enable wallet portfolio discovery, add a Zerion API key in Newframe settings and enable token auto-discovery.

## Related

- [Root project README](../../README.md) - overall Newframe overview and monorepo map.
- [Newframe Browser Extension](../newframe-extension/README.md) - browser companion extension.
