# Newframe skill

The `newframe` skill gives a local AI agent the bundled Newframe CLI. Install it directly from [GitHub](https://github.com/WardenJakx/newframe) with [Skills CLI](https://github.com/vercel-labs/skills). No plugin marketplace or repository checkout is needed.

Install for Codex and Claude Code:

```sh
npx skills add WardenJakx/newframe --skill newframe --agent codex --agent claude-code --global
```

Start a new agent session. Invoke `$newframe` in Codex or `/newframe` in Claude Code, or ask the agent to use Newframe.

Bun must be installed on the same computer as Newframe. Open and unlock the app, select a Seed or Ring wallet, and enable AI access in its Accounts menu. Approve the first agent session in Newframe.

The [skill](newframe/SKILL.md) runs its bundled CLI from `scripts/newframe.js`; installed agents need no source checkout or `node_modules`. The repository pre-commit hook runs `bun run build:skill:newframe` to refresh the bundle from the [CLI source](../apps/newframe-cli/src/index.ts).
