# Newframe Live-Local Harness

## Goal

Use the real `apps/newframe` Electron app with the developer's existing local user state, then attach automation to the live tray for visual and interaction checks.

This V1 harness does not seed mock data or intercept RPC traffic. It is an agent-assist workflow for local
visual review, not a deterministic CI test. New task checkouts start from the durable development-profile
snapshot described below.

## Launch

From `apps/newframe`:

```sh
bun run dev
```

The live-local and visual entrypoints use the same lifecycle modules under `harness/newframe/` for
Electron, Anvil, the local Flash service, health checks, failure monitoring, signals, and reverse-order
cleanup.

Close any normal running Newframe instance first. The app has a single-instance lock, and this harness must be the process that owns the local profile.

## State Model

The harness uses persisted Electron user state through `electron.app.getPath('userData')`. Development
profiles depend on the Git checkout:

- The primary checkout on attached `main` is canonical and uses `Newframe dev`.
- Every feature branch, linked worktree, and detached checkout gets a stable task profile named from its
  branch or detached state and worktree identity.
- A task profile takes a one-time snapshot when it is first created. Later launches never resync it from
  canonical, so task changes remain isolated.
- The snapshot includes only `config.json`, `vault.json`, and the complete `signers/` directory. It
  excludes biometric configuration, Chromium state, locks, logs, caches, sessions, backups, database
  journals, WAL files, and every other canonical entry. Native biometric unlock must be enabled separately
  in each task profile.

Close the canonical Newframe app before the first launch in a new task checkout so its durable files stay
unchanged during the one-time snapshot. The first snapshot fails if the canonical `Newframe dev` profile
does not exist. Newframe builds the snapshot in a temporary directory and publishes it atomically, so a
task profile is never visible in a partially copied state.

Implications:

- Current accounts, chains, balances, permissions, and unlocked/locked state are whatever the local profile contains.
- Live RPC, IPFS, updater, and balance refresh behavior can still run.
- Automation must avoid destructive actions unless the user explicitly asks for them.
- Assertions must not depend on exact balances, account counts, token counts, or dapp rows.

## Automation Attachment

Attach to the running Electron app through Chrome DevTools Protocol on port `9333`.

Preferred durable approach:

- Use Playwright from a checked-in or temporary script.
- Connect with `chromium.connectOverCDP('http://127.0.0.1:9333')`.
- Select the tray whose URL includes `bundle/tray.html`.

Useful manual approach:

- Use Playwright CLI to attach, inspect snapshots, click accessible controls, and take screenshots.

Raw CDP is allowed for debugging, but do not make raw `Runtime.evaluate` selector scripts the primary harness contract when Playwright locators can express the same user action.

## Operator Notes

Playwright CLI works well for interactive harness sessions:

```sh
playwright-cli attach --cdp=http://127.0.0.1:9333 --session newframe
playwright-cli --s=newframe snapshot
playwright-cli --s=newframe click <snapshot-ref>
playwright-cli --s=newframe screenshot --filename=/tmp/newframe-harness-shots/tray-current.png
```

Notes:

- Follow-up commands must use `--s=newframe`.
- Attach exposes `Tray` and on-demand `side-tray` Send/Trade windows; hardware recovery stays in Tray notifications;
  verify the current tab is `Tray`.
- Snapshot refs such as `e5` are temporary. Use them only within the current interactive session.
- `playwright-cli screenshot` requires `--filename=/path/file.png`; a positional argument is treated as an element selector or snapshot ref.
- Read live values from a fresh snapshot immediately before reporting them. Balances can change while RPC and balance refresh work is running.
- Treat new console errors as suspicious.
- Opening panels is safe. Clicking account rows, toggles, clear actions, add actions, send, or swap can mutate local state and should be avoided unless explicitly requested.

## Interaction Contract

Drive the app through accessibility labels and roles, not implementation classes.

Stable V1 controls:

- `button[name="Main menu"]`
- `button[name="Accounts"]`
- `button[name="Network filter"]`
- `tab[name="Positions"]`
- `tab[name="Activity"]`
- `dialog[name="Networks"]`
- `dialog[name="Dapps"]`
- `dialog[name="Custom Tokens"]`
- `dialog[name="Requests"]`
- `dialog[name="Accounts"]`
- `textbox[name="Search networks"]`
- `textbox[name="Filter assets"]`
- `button[name="Back"]`
- `button[name="Close accounts"]`

If automation needs a control that lacks a stable role/name, add an accessibility label to the app first. Do not fall back to CSS class selectors except during one-off investigation.

## Safe V1 Checks

Good default checks:

- Tray is present.
- Home screen is visible and screenshots are nonblank.
- Main menu opens.
- Dapps overlay opens from the menu.
- Custom Tokens opens from the menu.
- Networks overlay opens.
- Network search accepts text.
- Accounts panel opens.
- Activity tab opens.
- Console/startup output has no new unexpected errors.

Avoid by default:

- Toggling settings.
- Removing accounts, chains, permissions, or saved tokens.
- Sending transactions.
- Selecting a different account unless the user asks.

## Harness Architecture

The harness is split by responsibility:

- `core/` owns process execution, service lifecycle, configuration, health checks, and cleanup.
- `services/` contains one factory per managed dependency (`electron.ts`, `anvil.ts`,
  `local-trade.ts`, and contract harness commands in `contracts.ts`).
- `core/reaper.ts` starts every child as its own process group and guarantees those groups and the
  harness's temporary files die with the harness, however it exits.
- `live-harness.ts` is the regular live-local entrypoint.
- `run-visual-harness.ts` is the visual entrypoint. It picks free ports, then runs `visual-harness.ts`.
- `visual-harness.ts` is only the visual high-level orchestration.
- `visual/driver.ts` owns reusable Newframe interactions and state polling.
- `visual/anvil-client.ts` owns reusable Anvil RPC interactions.
- `visual/runtime.ts` owns stages, screenshots, summaries, and failure artifacts.
- `visual/stages/` contains one visual surface per file. `visual/stages/index.ts` defines their order.

The visual driver is fully typed: every tray-bound operation uses the application's command/query bridge,
with no generic channel or RPC fallback. State assertions run in Electron's main process against a read-only
canonical snapshot; that getter exists only when the visual harness launches the dev profile with
`NEWFRAME_VISUAL_HARNESS=true` and is never exposed to trays.

The visual harness imports Anvil's third default account as its signer when needed. Set
`NEWFRAME_HARNESS_PRIVATE_KEY` to use another local test key. It funds that account on the local chain.

### Isolation from the developer's desktop

The visual harness runs on the host, next to the developer's own Newframe and `bun run dev`:

- **Profile.** Each run copies the durable files (`config.json`, `vault.json`, `signers/`) of the canonical
  `Newframe dev` profile (`NEWFRAME_DEV_PROFILE` overrides the source) into a temporary profile, and points its
  local Anvil chain at the run's Anvil. The developer's profiles are never opened, so the single-instance lock
  never collides with a running Newframe. The canonical profile lives in Electron's app data directory:
  `~/Library/Application Support` on macOS, `$XDG_CONFIG_HOME` or `~/.config` on Linux.
- **Fresh machines.** Without a canonical profile that has a vault, the run seeds a temporary profile holding
  only a vault for `NEWFRAME_HARNESS_PASSWORD`, or for a generated password when none is set. Stages then add
  the harness signer and a `vitalik.eth` watch account themselves.
- **Ports.** Anvil, the local Flash and Safe services, and the app's local RPC each get a free port per run.
- **Screen.** Windows render offscreen at 2x scale; Playwright screenshots read that buffer. The native window
  that macOS still creates is fully transparent and ignores the mouse. Harness windows cannot take keyboard
  focus, and the app has no Dock icon, menu bar icon, global shortcuts, or Keychain access. Tray placement
  uses a fixed 1440x900 work area instead of the host's displays. Linux cannot make native windows
  transparent or click-through, so there Electron runs on a private Xvfb display instead.
- **Processes.** Every child leads its own process group. Services stop in reverse order; a synchronous
  exit hook kills any group still running; and a detached reaper kills the remaining groups and deletes the
  temporary profile if the harness itself is killed.
- **Checkout.** Runs in one checkout share its build output, so a file lock queues them. Runs in different
  worktrees proceed in parallel.

The visual harness writes `summary.json` to a new temporary directory per run, printed at preflight
(`NEWFRAME_HARNESS_OUTPUT_DIR` overrides it). The summary records overall duration,
per-stage duration, screenshots, contract evidence such as transaction/order/request identifiers, and
tray diagnostics. Each screenshot has a sibling `<name>.aria.yml` with the page's ARIA snapshot, a
text view of the same state that diffs cleanly and is cheaper than reading the image. Failed runs also
write a Playwright `trace.zip` (DOM snapshots, actions, console, and network up to the failure); open it
with `bunx playwright-core show-trace <path>/trace.zip`. Unexpected tray `console.error`, uncaught
page errors, or tray crashes fail the responsible stage. The source allowlist is intentionally empty by default; any future allowance must
use a narrow message pattern and document why the underlying browser diagnostic is understood and cannot
reasonably be fixed.

Open all screenshots from a successful run after service cleanup, together in Preview on macOS or as their
directory through `xdg-open` on Linux:

```sh
NEWFRAME_HARNESS_OPEN_SCREENSHOTS=1 bun run visual:harness:newframe
```

Opening screenshots is off by default. A launch failure is logged without failing the harness.

Operator-driven provider scripts live under `harness/newframe/scenarios`. They may require manual wallet
approval or mutate a running developer profile, so they are not part of the automated unit suite or the
authoritative visual harness.

### Add a visual surface

1. Add a file in `visual/stages/` that exports a `VisualStage` with a name and `run(context)` method.
2. Use the context's `driver`, `anvil`, and `runtime` instead of reimplementing bridge, polling,
   screenshot, or chain helpers.
3. Register the stage in `visual/stages/index.ts` at the point where it should run.

The entrypoint and stage runner do not need to change.

### Add a mock service

1. Add a factory in `services/` that implements `HarnessService` directly or returns a
   `ProcessService`.
2. Put port checks and readiness/health checks in the service's startup configuration.
3. Add a shared service to the relevant entrypoint with `runtime.start(service)`, or start a
   surface-specific service from its stage with `context.services.start(service)`.

The shared runtime monitors unexpected exits and always stops started services in reverse order, so
each service only owns its own startup and cleanup behavior.
