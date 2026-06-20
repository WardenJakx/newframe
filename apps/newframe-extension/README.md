# Newframe Browser Extension

Newframe Browser Extension is the companion browser surface for the Newframe desktop app. It injects a Newframe-connected [EIP-1193](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1193.md) provider into web apps as `window.ethereum`, so sites can connect through Newframe even when they do not offer a native Newframe connection option.

For the full project overview, features, and surface map, start with the [root README](../../README.md). For desktop app setup, see [apps/newframe](../newframe/README.md).

## Download and get started

### Prerequisite

Install and run the Newframe desktop app before using the extension. The extension connects to the local Newframe provider exposed by the desktop app.

### Build from source

```bash
git clone https://github.com/wardenjakx/newframe.git
cd newframe
bun install
bun run build:newframe-extension
```

The built extension is written to `apps/newframe-extension/dist`.

### Install in Chrome, Brave, or Chromium browsers

1. Go to `chrome://extensions` or `brave://extensions`.
2. Turn developer mode on.
3. Select "Load unpacked".
4. Select `apps/newframe-extension/dist`.

### Install in Firefox

1. Go to `about:debugging#/runtime/this-firefox`.
2. Select "Load Temporary Add-on...".
3. Select `apps/newframe-extension/dist/manifest.json`.

## Development

From the repo root:

```bash
bun run build:newframe-extension
bun run test:newframe-extension
```

Or from this package directory:

```bash
bun run build
bun run watch
bun run typecheck
```

## Related

- [Root project README](../../README.md) - overall Newframe overview and monorepo map.
- [Newframe Desktop App](../newframe/README.md) - desktop wallet and system-wide provider app.
