---
name: component-preview
description: Render NewFrame React components from temporary fixtures for focused visual inspection, screenshots, and interaction checks.
---

Use the maintained runner from the current worktree root:

```sh
bun run newframe preview:component /absolute/fixture.tsx
bun run newframe preview:component /absolute/fixture.tsx --screenshot /absolute/output.png
bun run newframe preview:component /absolute/fixture.tsx --screenshot /absolute/output.png --check /absolute/check.ts
```

Serve mode prints a loopback URL and runs until Ctrl-C. Capture defaults to 420×900 at scale 1; override with `--width` and `--height`. Chromium must already be installed. If Playwright's default executable is unavailable, pass `--browser /absolute/path/to/chromium`. No downloads occur.

Create one temporary TSX file that default-exports a component. Bare fixture imports resolve from `apps/newframe`. This minimal fixture renders the current shared Button:

```tsx
import type { ComponentProps } from 'react'
import { Button } from '@newframe/ui/button'

const props = {
  appearance: 'primary',
  children: 'Review'
} satisfies ComponentProps<typeof Button>

export default function Preview() {
  return (
    <div style={{ padding: 16 }}>
      <Button {...props} />
    </div>
  )
}
```

Replace Button with the target component and its required props. Resolve production file imports against `pwd` in the current worktree, never another checkout. Inspect the component and canonical contract types before constructing data. Use `satisfies` and explicit types; no `as never` or `any` fakes. Avoid importing request capability test fakes: they depend on `bun:test` and cannot run in a browser. Keep fixtures scoped to the scenario; reuse current production components and wrappers. The runner supplies `UIRoot`, dark theme, full height, fresh shared UI assets, and generated app CSS. Add `TrayOverlay` or other required providers in the fixture. Use inline styles or plain CSS for fixture-only layout because Panda does not scan temporary TSX files.

Bun transpiles fixtures without typechecking. Use canonical prop/capability types and run a suitable TypeScript check when needed; do not treat a successful screenshot as type evidence. Temporary typecheck configuration may need explicit paths to this worktree's app dependencies.

An optional check file uses ordinary Playwright actions and assertions, then the runner captures the resulting state:

```ts
import type { Page } from 'playwright-core'

export default async function check(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Review' }).click()
  await page.getByRole('heading', { name: 'Proposal details' }).waitFor()
  const disabled = await page.getByRole('button', { name: 'Confirm' }).isDisabled()
  if (!disabled) throw new Error('Confirm should be disabled')
}
```

Use locators to await scenario-specific async state. Checks run in Bun; use absolute paths for runtime imports from temporary check files. Capture blocks external HTTP requests, reports page/resource failures, waits for React commit and fonts/images, and disables animations for the screenshot. Supply local assets and deterministic fixture data. A failed capture removes prior output at the requested screenshot path.

Inspect the actual PNG before reporting. Return it in chat as `![Component preview](/absolute/output.png)` and state which interactions were checked. This provides evidence for the fixture's component state; wallet services, Electron integration, and live account behavior require their own checks. Fixtures, check files, and screenshots remain; generated build files are cleaned up.
