# Newframe Desktop App

Newframe's desktop app is the Electron wallet and system-wide provider surface for macOS, Windows, and Linux. It exposes local JSON-RPC endpoints for native, command-line, and browser clients, and it works with the [Newframe Browser Extension](../newframe-extension/README.md) when a web app expects an injected provider.

For the full project overview, features, and surface map, start with the [root README](../../README.md).

## Download and get started

### Download the app

- [Production releases](https://github.com/wardenjakx/newframe/releases)
- [Canary releases](https://github.com/wardenjakx/newframe/releases)

After installing, open Newframe from your applications folder or app launcher.

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

### Connect to Newframe natively

Newframe exposes system-wide JSON-RPC endpoints at `http://127.0.0.1:1248` and `ws://127.0.0.1:1248`. Prefer HTTP for request/response JSON-RPC calls. Use WebSocket only when you need pushed subscription events such as account, chain, or asset changes.

### Connect through the browser extension

The browser extension injects a Newframe-connected [EIP-1193](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1193.md) provider into web apps as `window.ethereum`. Use it when a site does not offer a native Newframe connection option.

### Enable portfolio discovery

To enable wallet portfolio discovery, add a Zerion API key in Newframe settings and enable token auto-discovery.

## Related

- [Root project README](../../README.md) - overall Newframe overview and monorepo map.
- [Newframe Browser Extension](../newframe-extension/README.md) - browser companion extension.
