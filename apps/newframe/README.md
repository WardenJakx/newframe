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

### Enable portfolio discovery

To enable wallet portfolio discovery, add a Zerion API key in Newframe settings and enable token auto-discovery.

## Related

- [Root project README](../../README.md) - overall Newframe overview and monorepo map.
- [Newframe Browser Extension](../newframe-extension/README.md) - browser companion extension.
