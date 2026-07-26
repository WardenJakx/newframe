# Test layout

- Unit and component tests are colocated with their source as `*.test.ts` or `*.test.tsx`.
- Cross-module integration tests belong in `test/integration`.
- End-to-end tests belong in `test/e2e`.
- Shared Bun preloads, mocks, and rendering helpers belong in `test/support`.

Production code must not import test files, test fixtures, or support modules. Compile and bundle
commands verify that test-only artifacts are not included in their output.
