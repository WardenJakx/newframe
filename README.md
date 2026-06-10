# Newframe

Monorepo for the Frame desktop app and browser extension.

## Layout

- `apps/frame` - Electron desktop wallet/provider app.
- `apps/frame-extension` - browser companion extension.
- `packages` - shared libraries for protocol, connector, and cross-app code.

## Common Commands

```bash
bun install
bun run dev:frame
bun run build:extension
bun run test
```

Run app-specific scripts with Bun workspace cwd commands:

```bash
bun --cwd apps/frame run dev
bun --cwd apps/frame-extension run build
```
