# Newframe Browser Extension

Newframe Browser Extension is the companion browser surface for the Newframe desktop app. It injects a Newframe-connected [EIP-1193](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1193.md) provider into web apps as `window.ethereum`, so sites can connect through Newframe even when they do not offer a native Newframe connection option.

For the full project overview, features, and surface map, start with the [root README](../../README.md). For desktop app setup, see [apps/newframe](../newframe/README.md).

## Download and get started

### Prerequisite

Install, run, and unlock the Newframe desktop app before using the extension. The extension connects to the local Newframe provider exposed by the desktop app.

### Install a release

1. From [GitHub Releases](https://github.com/wardenjakx/newframe/releases), download both `Newframe-Browser-Extension-<version>.zip` and `Newframe-Browser-Extension-<version>.zip.sha256`.
2. Put both files in the same directory and verify the archive:

   ```bash
   shasum -a 256 -c Newframe-Browser-Extension-<version>.zip.sha256
   ```

   Continue only when the command reports `OK`. On systems without `shasum`, use an equivalent SHA-256 tool and compare its result with the digest in the `.sha256` file.

3. Extract the ZIP. Keep the extracted directory: these manual installations load files from that directory and do not update automatically.

#### Chrome, Brave, and Chromium

1. Open `chrome://extensions` in Chrome or Chromium, or `brave://extensions` in Brave.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Select the extracted extension directory. It is the directory that contains `manifest.json`.

The packaged extension requires Chrome 121 or newer. To update or roll back, remove the loaded copy, verify and extract the desired release, then load that directory.

#### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on…**.
3. Select `manifest.json` inside the extracted extension directory.

Firefox installation is temporary only. Firefox removes the extension when the browser exits, so repeat these steps after every restart.

### Current distribution limitations

- This is an unpacked developer extension, not a browser-store package.
- There are no automatic extension updates. Download and verify every new version manually.
- Firefox support is temporary-session loading only.
- The desktop app must remain running and unlocked for wallet requests.
- The extension requests access to HTTP and HTTPS pages so it can expose the Newframe provider to web apps. Install it only from this repository and verify its checksum.

### Roll back

Extension releases use tags named `extension-v<version>`. Remove the currently loaded extension, download an earlier release ZIP and its checksum, verify and extract it, and load that extracted directory. Published assets are not modified in place; fixes are published as a new version.

### Build from source

```bash
git clone https://github.com/wardenjakx/newframe.git
cd newframe
bun install
bun run build:newframe-extension
```

The built extension is written to `apps/newframe-extension/dist`. Load that directory in a Chromium browser or load its `manifest.json` temporarily in Firefox using the steps above.

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
- [Maintainer release checklist](../../docs/releasing.md) - workflow-driven release, smoke-test, and fix-forward procedure.
