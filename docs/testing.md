# Testing

How Newframe is tested in the endgame described by [architecture.md](architecture.md). Names follow [GLOSSARY.md](../GLOSSARY.md).

## Approach

The core is tested as it ships: assembled, unmodified, and reached only across its real boundaries. What we replace is what lies outside it. Remote services, dapps, and local API clients are swapped for virtual services that speak the real protocols, so a test exercises the same code a user does.

There are three kinds of test and one set of code checks. Each answers a different question.

| Kind                  | Question                                                       | Runs against                                                       |
| --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Boundary tests**    | Does each boundary refuse what it must refuse?                 | The assembled core, driven across one boundary with hostile input  |
| **Integration tests** | Does a real use of Newframe work from end to end?              | The built desktop app with virtual services, in the visual harness |
| **Unit tests**        | Does a self-contained piece of logic compute the right answer? | The function alone, with nothing of ours replaced                  |
| **Code checks**       | Is the code written the way we require?                        | The source, without running it                                     |

We do not write:

- Tests that replace one of our own parts with a mock. A mock hides the places bugs live: the wiring between parts.
- Component or markup tests for trays.
- Line-coverage targets or test-count baselines.

## Boundary tests

One suite per boundary in the [trust zones](architecture.md#trust-zones). A boundary's owner validates once, so its suite is the only place those rejections are asserted. Everything behind the boundary is real; nothing is stubbed to make a test pass.

Each suite is mostly rejections. The accepting cases are covered by integration tests.

| Boundary                   | Driven through                             | Must prove                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dapp → extension           | The extension's page-facing messages       | The dapp origin comes from the browser, never from the page. A page cannot send the extension's own messages                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Outside or relay → core    | The local API, as a real client            | An unapproved extension, a browser page calling directly, and a missing, expired or revoked AI session credential are refused. Malformed, oversized and too-frequent messages are refused. A request relayed for a dapp carries the dapp as its request source                                                                                                                                                                                                                                                                                                                         |
| Tray → core                | The tray entry point                       | A message that did not come from one of our trays is refused, including from a tray window that has navigated away. A side tray cannot do what only the main tray may                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Request → feature          | Any entry point                            | Generated from the operation catalog: every entry admits the request sources and authority it names and rejects all others; unknown gateway operations and malformed input are rejected; wrapper methods get no extra reach. While locked, nothing but unlocking is admitted. A request source is told of an event only if it could have asked. Extension account access caps what a dapp can be granted. A grant for a Safe wallet reveals nothing about its Safe owners. An AI session is refused outside its scope, after expiry or revocation, and while its profile is not active |
| Human decision → signature | The tray entry point and a pending request | Only a tray can approve. The vault is asked only for an approved request and signs the contents the gateway holds with the human's edits applied. An approval that changes a field that is not editable is refused. A second approval of the same request does nothing                                                                                                                                                                                                                                                                                                                 |
| Gateway → vault            | The vault's interface                      | Nothing is released while locked, with a wrong password or failed biometric, or when the account or signer has changed since approval. No decrypted secret remains afterwards                                                                                                                                                                                                                                                                                                                                                                                                          |
| Remote service → core      | A virtual service set to misbehave         | Per remote service, following its row in the [trust table](architecture.md#remote-services): malformed responses are refused; a node reporting the wrong chain ID is not kept; an altered Safe proposal is shown as a mismatch; an uncheckable one as not verified; a false confirmation is not counted                                                                                                                                                                                                                                                                                |
| Disk → core                | Stored state on disk                       | Malformed or outdated stored state is refused or migrated, never loaded as is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Core → tray                | A tray's projection                        | No secret appears in a projection. Each tray receives only its own                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

The request → feature suite is generated from the operation catalog, so a new gateway operation is covered without writing a test, and one with no policy fails.

## Virtual services

A virtual service is a local stand-in for something outside the core. It is the only thing a test replaces.

Rules:

- **One way in.** The core is pointed at virtual services through a single setting at the composition root, available only in a development profile. No part of the core checks whether it is under test.
- **Real protocol, real transport.** It answers over HTTP or WebSocket exactly as the real one does. The production client talks to it unchanged; only the address differs.
- **State can be driven.** A test changes the virtual service's state (a balance, an order's status, a Safe proposal) and asserts that Newframe follows.
- **It can misbehave.** Each one can be told to return malformed, inconsistent or tampered responses. That is how the remote service → core boundary is tested.
- **Effects are checked on it.** An integration test that sends, trades or confirms asserts the effect where it lands, not only what the tray shows.
- **Its coverage is written down.** Each records which documented requests, responses and failures of the real remote service it models. A virtual service proves Newframe works with the modelled protocol; it is only as good as that record.

| Outside thing                | Virtual service                                         | Status                                                                                   |
| ---------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Network node                 | Anvil, with test contracts deployed                     | Exists                                                                                   |
| Trading service              | Local trading service                                   | Exists                                                                                   |
| Safe transaction service     | Local Safe service, with Safe wallets deployed on Anvil | Exists                                                                                   |
| Portfolio and price sources  | Local portfolio service                                 | Missing                                                                                  |
| Contract description sources | Local description service                               | Missing                                                                                  |
| Dapp, through the extension  | Harness extension relaying for a scripted dapp          | Exists                                                                                   |
| Local API client             | The Newframe CLI and scripts using the real client      | Exists                                                                                   |
| Hardware wallet              | None                                                    | Not virtualized. Integration tests use hot wallets; hardware wallets are checked by hand |

The human is not virtualized either. The visual harness acts as the human by driving the trays through their accessible controls.

## Integration tests

Integration tests run in the visual harness: the built desktop app, the virtual services, and a driver acting as the human. Each one uses Newframe the way a person would and checks three things:

1. **What the tray shows**, by screenshot at each step.
2. **The effect outside**, on the virtual service: the balance on Anvil moved, the order exists, the confirmation was submitted.
3. **Nothing unexpected happened**: no errors in the tray, no crash.

Integration tests are for wiring and for looking, not for edge cases. Every rejection belongs to a boundary suite. The set stays small enough to read: one per feature, plus the paths that cross the most boundaries.

| Integration test                  | Crosses                                               |
| --------------------------------- | ----------------------------------------------------- |
| Unlock, and lock                  | Tray, gateway, vault                                  |
| Add an account                    | Tray, gateway, vault, accounts                        |
| Dapp connects and signs           | Dapp, extension, gateway, tray, vault                 |
| Dapp asks to add a network        | Dapp, extension, gateway, tray, network node          |
| Send                              | Side tray, gateway, main tray, vault, network node    |
| Trade                             | Side tray, trading service, gateway, main tray, vault |
| Confirm a Safe proposal           | Safe transaction service, gateway, tray, vault        |
| AI session signs without a prompt | Newframe CLI, gateway, vault, network node            |
| Export a private key              | Tray, gateway, password confirmation, vault           |
| Balances follow the network       | Network node, assets, tray                            |

### Trays

Trays have no tests of their own. A tray is correct if it looks right and the integration test through it works, and both are judged in the visual harness:

- Every step of an integration test captures a screenshot. The visual harness is how visual work is reviewed, by agents and humans alike.
- The driver finds controls by accessible role and name only. A control it cannot find that way is fixed in the tray, not worked around in the driver.
- An isolated component can be rendered from a fixture with the component preview while developing. That is for looking, not a test.

## Unit tests

A unit test fits where a piece of logic stands alone and its right answer is known from outside the code: hashing, encoding, decoding, deriving addresses. A wrong answer there can mean the human signs something other than what is shown, and an integration test only exercises the versions and cases the virtual services happen to cover.

Like every other test here, a unit test replaces none of our own parts.

## Code checks

Rules about how code is written are enforced on the source, not by tests.

| Check              | Enforces                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Types              | Message and state shapes agree on both sides of every boundary                                                                                                      |
| Package boundaries | The allowed imports in [architecture.md](architecture.md#layout): trays never import the core, only the gateway reaches the vault, features never import each other |
| Lint               | Trays use the shared design system: no hard-coded colours, spacing or one-off components. General correctness rules                                                 |
| Unused code        | Nothing is exported or kept only for a test                                                                                                                         |
| Formatting         | One style                                                                                                                                                           |
| Build output       | No test code or virtual service ships in the desktop app or extension                                                                                               |

## What a change needs

| Change                                      | Add                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| A new gateway operation                     | Nothing for admission; it is generated. An integration test step if it is user-facing |
| A new feature                               | One integration test                                                                  |
| A new remote service                        | A virtual service, its misbehaving cases, and its row in the trust table              |
| A new entry point or kind of request source | A boundary suite                                                                      |
| A new kind of authority                     | Cases in the request → feature suite                                                  |
| A new hash, encoding or decoding            | Unit tests                                                                            |
| A change to how a tray looks                | Nothing new; review the screenshots                                                   |
| A bug fix                                   | A case in the boundary suite that should have caught it, or an integration test step  |

## When they run

- **Every change:** code checks, boundary tests, unit tests.
- **Every change that can affect the desktop app:** the visual harness.

Today the first set runs from hooks on the developer's computer before a commit or push, and the visual harness is started by hand. No shared runner checks a change after it is pushed.
