# Test layout

- Unit and component tests are colocated with their source as `*.test.ts` or `*.test.tsx`.
- Cross-module integration tests belong in `test/integration`.
- Shared Bun preloads, boundary fakes, and rendering helpers belong in `test/support`.
- Preloads provide runtime environments only: `dom.preload.ts` installs the browser test
  environment and `electron.preload.ts` replaces Electron when main-process tests run under Bun.
  Application collaborators such as the store, persistence, windows, navigation, and renderer host
  are opt-in fixtures owned by the tests that use them.
- `scripts/run-renderer-tests.ts` runs plain TypeScript renderer tests without a preload and limits
  the DOM preload to TSX component and hook tests.

The scripts under `harness/newframe/scenarios` are operator-driven exercises against a separately
running Newframe instance. They are deliberately not named as tests and are not part of `test:unit`
or `test:all`. The assembled, deterministic system and acceptance suite is
`harness/newframe/visual-harness.ts`.

`test/critical-coverage.json` owns risk-based line and function coverage floors for authorization
and IPC, signing and secrets, persistence, and transaction lifecycle behavior. The floors are
ratchets based on the current focused suite, not a global percentage target; raise a group when its
tests improve. Bun 1.3 LCOV does not emit branch records, so distinct authorization, security,
failure, and retry branches remain explicit behavioral tests instead of a fabricated branch metric.

Production code must not import test files, test fixtures, or support modules. Compile and bundle
commands verify that test-only artifacts are not included in their output.
