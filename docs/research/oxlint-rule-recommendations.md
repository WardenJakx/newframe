# Stronger Oxlint rules

Checked 2026-09-13 against this checkout and official documentation. Rules are now enabled; the original audit below records the starting point.

## Current rollout

Verified after building package declarations: 844 linted files, 0 errors, 10,079 warnings. All 1,507 tests, workspace typechecking, and formatting checks pass. Warning counts include the existing explicit-any backlog and the newly included signer code.

Errors now enforce array callback returns, strict equality with a nullish-check exception, eval restrictions, executable-URL restrictions, nonempty error messages, safe spreads, type-only imports, optional chaining, and React raw-HTML restrictions. Existing await-thenable enforcement remains in place. Inline import type queries remain allowed because they already express type-only dependencies.

The smaller cleanup fixes type imports and optional chains, merges request/response headers through the Headers API, returns false explicitly from the signature matcher, and supplies a meaningful fallback validation error. Two narrow suppressions preserve intentional hostile-URL and prototype-dropping test fixtures.

Deferred work reports warnings on normal lint runs:

| Cleanup                                                       | Warning rules                                                                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Validate external data and contain any propagation            | typescript/no-unsafe-assignment, no-unsafe-argument, no-unsafe-call, no-unsafe-member-access, no-unsafe-return |
| Review string formatting and rejection handling at boundaries | typescript/no-base-to-string, use-unknown-in-catch-callback-variable, only-throw-error                         |
| Review callbacks and assertions                               | typescript/unbound-method, no-unnecessary-type-assertion                                                       |
| Review condition semantics before changing defaults           | typescript/prefer-nullish-coalescing, no-unnecessary-condition                                                 |
| Broader readability cleanup                                   | curly, no-nested-ternary                                                                                       |
| Stable React list identity                                    | react/no-array-index-key                                                                                       |
| Test correctness, pending Bun import recognition              | jest/no-focused-tests, valid-expect, valid-describe-callback, no-identical-title, no-conditional-expect        |

Production signer implementations and support files are now included. Their previously hidden violations have a final scoped warning override. Existing test/spec files are excluded from that override, preserving their error enforcement. Remove each warning override as its signer cleanup is completed.

The built-in Jest plugin does not recognize bun:test imports in the installed version. A scoped no-restricted-properties warning independently catches test.only, it.only, and describe.only. Aliased imports and the broader assertion checks still need a later compatibility pass; zero Jest diagnostics do not establish coverage.

Run `bun run lint` to see the backlog. Use a per-rule/per-directory batch for cleanup; blanket `lint:fix` also applies fixes to warning rules.

## Coverage before this rollout

The repository pins Oxlint 1.80.0, oxlint-tsgolint 7.0.2001, and TypeScript 7.0.2. Type-aware linting is already enabled, with floating/misused promise checks, exhaustive switches, and extensive React hooks/compiler checks. `categories.correctness` is explicitly off, so rules described as defaults in the documentation still need explicit enablement here. Sources: [configuration](../../.oxlintrc.json), [dependencies](../../package.json).

## Initial recommendations

| Rule                                                                                                                                                                                        | Benefit / suggested scope                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`typescript/await-thenable`](https://oxc.rs/docs/guide/usage/linter/rules/typescript/await-thenable)                                                                                       | Catch awaiting a function instead of calling it, or awaiting a synchronous result.                                                                                                       |
| [`typescript/no-misused-spread`](https://oxc.rs/docs/guide/usage/linter/rules/typescript/no-misused-spread)                                                                                 | Catch spreading promises and unsuitable values.                                                                                                                                          |
| [`typescript/unbound-method`](https://oxc.rs/docs/guide/usage/linter/rules/typescript/unbound-method.html)                                                                                  | Catch callbacks/destructuring that lose `this`; start with production code.                                                                                                              |
| [`typescript/no-base-to-string`](https://oxc.rs/docs/guide/usage/linter/rules/typescript/no-base-to-string)                                                                                 | Prevent accidental `[object Object]` strings.                                                                                                                                            |
| [`array-callback-return`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/array-callback-return)                                                                                        | Catch forgotten returns in `map`, `filter`, and related callbacks. Default `checkForEach: false` avoids extra style churn.                                                               |
| [`eqeqeq`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/eqeqeq)                                                                                                                      | Require strict equality; use `["error", "always", { "null": "ignore" }]` to preserve intentional nullish checks.                                                                         |
| [`no-eval`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-eval.html), [`typescript/no-implied-eval`](https://oxc.rs/docs/guide/usage/linter/rules/typescript/no-implied-eval.html) | Block eval, string timers, and Function construction. For JavaScript, use `eslint/no-implied-eval` and [`no-new-func`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-new-func). |
| [`jest/no-focused-tests`](https://oxc.rs/docs/guide/usage/linter/rules/jest/no-focused-tests), [`jest/valid-expect`](https://oxc.rs/docs/guide/usage/linter/rules/jest/valid-expect)        | Prevent committed `.only` and incomplete/unawaited assertions; enable the Jest plugin in matching tests.                                                                                 |

## Further tightening

- `typescript/no-unsafe-assignment`, `no-unsafe-argument`, `no-unsafe-call`, `no-unsafe-member-access`, and `no-unsafe-return` catch unsafe `any` uses that a ban on explicitly writing `any` misses. Prioritize external-data boundaries. [Rule catalog](https://oxc.rs/docs/guide/usage/linter/rules), [assignment rule](https://oxc.rs/docs/guide/usage/linter/rules/typescript/no-unsafe-assignment).
- `typescript/use-unknown-in-catch-callback-variable` forces `.catch((error: unknown) => ...)`, requiring narrowing before use. TypeScript's `useUnknownInCatchVariables` does not cover Promise callbacks. [Upstream rule documentation](https://typescript-eslint.io/rules/use-unknown-in-catch-callback-variable/).
- `typescript/only-throw-error` prevents throwing strings/plain objects, preserving standard error behavior and stack traces. Review protocol-specific error contracts before replacing existing thrown objects. [Rule documentation](https://oxc.rs/docs/guide/usage/linter/rules/typescript/only-throw-error).
- `typescript/consistent-type-imports` makes type-only imports explicit. `typescript/prefer-optional-chain` simplifies repeated null checks. Both are reasonable readability additions. [Type imports](https://oxc.rs/docs/guide/usage/linter/rules/typescript/consistent-type-imports), [optional chains](https://oxc.rs/docs/guide/usage/linter/rules/typescript/prefer-optional-chain).

## Initial audit

Read-only audits covered 821 files with existing exclusions. Baseline was 0 errors and 721 `no-explicit-any` warnings. Candidate counts measure diagnostics, not confirmed defects.

| Candidate                                                                                                                             |                                      Diagnostics |
| ------------------------------------------------------------------------------------------------------------------------------------- | -----------------------------------------------: |
| `typescript/no-misused-spread`                                                                                                        |                                                5 |
| `array-callback-return`                                                                                                               |                                                1 |
| `typescript/no-base-to-string`                                                                                                        |                                               33 |
| `typescript/await-thenable`                                                                                                           | 156, including 153 in paths containing test/spec |
| `typescript/unbound-method`                                                                                                           |                                              114 |
| `typescript/use-unknown-in-catch-callback-variable`                                                                                   |                                               47 |
| `typescript/only-throw-error`                                                                                                         |                                                2 |
| `typescript/consistent-type-imports`                                                                                                  |                                               80 |
| `typescript/prefer-optional-chain`                                                                                                    |                                               45 |
| `typescript/no-unnecessary-type-assertion`                                                                                            |                                              246 |
| `react/no-array-index-key`                                                                                                            |                                                5 |
| `no-eval`, `typescript/no-implied-eval`, `no-new-func`, `react/no-danger`                                                             |                                           0 each |
| `eqeqeq` with `null: "ignore"`                                                                                                        |                                                0 |
| `jest/no-focused-tests`, `jest/valid-expect`, `jest/valid-describe-callback`, `jest/no-identical-title`, `jest/no-conditional-expect` |                                           0 each |

The clearest spread finding is `...init.headers` in [trade requests](../../apps/newframe/src/features/transactions/trade/main/index.ts). `RequestInit.headers` can be a `Headers` instance or tuples, so plain object spread does not reliably preserve headers. Merge headers through the `Headers` API.

Review other findings before edits. The array callback implicitly returns a falsy value, which may be intentional. Two RPC awaits operate on `provider.send` typed as `void`, possibly an interface mismatch. One `only-throw-error` report is an intentional `Symbol` sentinel.

`no-script-url` reported one intentional hostile-URL fixture; scope it to production. A focused local probe confirmed that `jest/no-focused-tests` and `jest/valid-expect` reported neither `test.only` nor an incomplete assertion imported from `bun:test`. The identical probe importing from `@jest/globals` produced both expected diagnostics. Do not adopt these as Bun test coverage without resolving import recognition.

Avoid mass adoption of high-churn rules. The five unsafe-`any` rules produced 4,201 reports, including unresolved error types in this checkout; resolve those before treating the count as migration size. `curly` produced 2,416 reports, `no-nested-ternary` 152, and `prefer-nullish-coalescing` 1,085. These are weaker first steps than the targeted checks above.

## Adoption caveats

Type-aware rules require resolved dependencies and package declaration outputs. This repository already has the required tooling; additional rules need no new type-aware setup. Preserve the existing file scopes and ensure their plugins are enabled. [Oxlint type-aware guide](https://oxc.rs/docs/guide/usage/linter/type-aware).

The initial configuration excluded production signer implementations. The current rollout includes them with warnings while retaining strict test coverage. [Configuration](../../.oxlintrc.json).

`unbound-method` can report methods passed to Jest assertions; upstream recommends a Jest-aware replacement for tests. Methods independent of `this` can declare `this: void`. [Upstream guidance](https://typescript-eslint.io/rules/unbound-method/).

Defer broad `typescript/no-unnecessary-condition` adoption: Oxlint still labels it Nursery. Runtime boundary checks may also be intentional despite optimistic static types. [Rule documentation](https://oxc.rs/docs/guide/usage/linter/rules/typescript/no-unnecessary-condition.html).
