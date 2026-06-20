# Newframe Live-Local Harness

## Goal

Use the real `apps/newframe` Electron app with the developer's existing local user state, then attach automation to the live tray renderer for visual and interaction checks.

This V1 harness intentionally does not seed mock data, copy profiles, or intercept RPC traffic. It is an agent-assist workflow for local visual review, not a deterministic CI test.

## Launch

From `apps/newframe`:

```sh
bun run harness:newframe
```

This runs:

1. `bun run compile`
2. `bun run bundle`
3. `electron --remote-debugging-port=9333 ./compiled/main`

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
- Current known console noise includes `Invalid Sentry Dsn: https://placeholder.sentry.io`; treat other new console errors as suspicious.
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
