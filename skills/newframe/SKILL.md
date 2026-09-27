---
name: newframe
description: Use the bundled Newframe CLI to connect an AI wallet, sign or send transactions, and quote, submit, watch, or cancel Flash orders.
---

# Newframe

Use Bun to run the bundled CLI at `scripts/newframe.js` beside this file. Resolve its absolute path, then run `bun <script-path> help`. Read [CLI.md](references/CLI.md) for the Flash request format and command details. The CLI returns JSON.

Newframe must be open and unlocked with a selected Seed or Ring wallet that has AI access enabled. Run `session start --name "Your agent" --duration 3600` through the bundled CLI, wait for the user's approval, and check the returned account. The CLI stores the credential privately; do not read or print it.

For Flash, quote to a file and submit that same file. Retry submission with the same file if interrupted. Check the account and trade details before submitting.
