# Newframe Live-Local Harness

## Goal

Use the real `apps/newframe` Electron app with the developer's existing local user state, then attach automation to the live tray renderer for visual and interaction checks.

This V1 harness intentionally does not seed mock data, copy profiles, or intercept RPC traffic. It is an agent-assist workflow for local visual review, not a deterministic CI test.

## Launch

From `apps/newframe`:

```sh
bun run harness:newframe
```

The live-local and visual entrypoints use the same lifecycle modules under `harness/newframe/` for
Electron, Anvil, the local Flash service, health checks, failure monitoring, signals, and reverse-order
cleanup.

Close any normal running Newframe instance first. The app has a single-instance lock, and this harness must be the process that owns the local profile.

## State Model

The harness uses the existing persisted Electron user state. It reads the same profile the app normally reads through `electron.app.getPath('userData')`.

Implications:

- Current accounts, networks, balances, permissions, and unlocked/locked state are whatever the local profile contains.
- Live RPC, IPFS, updater, and balance refresh behavior can still run.
- Automation must avoid destructive actions unless the user explicitly asks for them.
- Assertions must not depend on exact balances, account counts, token counts, or dapp rows.

## Automation Attachment

Attach to the running Electron app through Chrome DevTools Protocol on port `9333`.

Preferred durable approach:

- Use Playwright from a checked-in or temporary script.
- Connect with `chromium.connectOverCDP('http://127.0.0.1:9333')`.
- Select the renderer whose URL includes `bundle/tray.html`.

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
- Attach currently exposes both `Tray` and `Dash`; verify the current tab is `Tray`.
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
- `dialog[name="Requests"]`
- `dialog[name="Accounts"]`
- `textbox[name="Search networks"]`
- `textbox[name="Filter assets"]`
- `button[name="Back"]`
- `button[name="Close accounts"]`

If automation needs a control that lacks a stable role/name, add an accessibility label to the app first. Do not fall back to CSS class selectors except during one-off investigation.

## Safe V1 Checks

Good default checks:

- Tray renderer is present.
- Home screen is visible and screenshots are nonblank.
- Main menu opens.
- Dapps overlay opens from the menu.
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
- `live-harness.ts` is the regular live-local entrypoint.
- `visual-harness.ts` is only the visual entrypoint and high-level orchestration.
- `visual/driver.ts` owns reusable Newframe interactions and state polling.
- `visual/anvil-client.ts` owns reusable Anvil RPC interactions.
- `visual/runtime.ts` owns stages, screenshots, summaries, and failure artifacts.
- `visual/stages/` contains one visual surface per file. `visual/stages/index.ts` defines their order.

The visual driver is fully typed: every renderer-bound operation uses the application's command/query bridge,
with no generic channel or RPC fallback. State assertions run in Electron's main process against a read-only
canonical snapshot; that getter exists only when the visual harness launches the dev profile with
`NEWFRAME_VISUAL_HARNESS=true` and is never exposed to renderers.

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
