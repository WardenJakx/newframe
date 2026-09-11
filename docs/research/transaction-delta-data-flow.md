# Transaction delta data flow

Checked 2026-09-10. Research only; no product code changed.

## Answer

The trace has enough information to calculate native and ERC-20 changes for every known account without another RPC call. Today Newframe calculates those changes for `req.account` only. The temporary transfer records still have `from` and `to`, but `effectsFromTrace` reduces them to a flat `TransactionEffect[]` for one address. `TransactionEffect` has no account field. [Simulation types](../../apps/newframe/src/features/transactions/domain/index.ts#L46-L79), [temporary transfer shape](../../apps/newframe/src/features/transactions/main/simulation.ts#L19-L24), [single-account reduction](../../apps/newframe/src/features/transactions/main/simulation.ts#L210-L242), [trace projection](../../apps/newframe/src/features/transactions/main/simulation.ts#L442-L460)

A disposable probe called `effectsFromTrace` twice with the same trace and changed only `req.account`. For account A it returned native `out 0x64` and ERC-20 `out 0x32`; for account B it returned the matching `in` effects. This proves that multi-account delta calculation can reuse one trace. It does not solve persistence: canonical activity is one record per transaction hash and each record names one account. [Activity ID](../../apps/newframe/src/features/accounts/main/index.ts#L74-L76), [record construction](../../apps/newframe/src/features/accounts/main/index.ts#L323-L359), [activity storage update](../../apps/newframe/src/platform/state-store/actions.ts#L357-L377)

The main implementation obstacle is therefore the activity identity and lifecycle, not trace coverage. Two account-relative rows for one hash cannot coexist under the current `activity[hash]` key. Confirmation monitors, notifications, position refresh state, and same-nonce cleanup also use that hash-derived activity ID. [Submission and notification](../../apps/newframe/src/features/accounts/main/index.ts#L361-L398), [position refresh](../../apps/newframe/src/features/accounts/main/index.ts#L438-L464), [request monitor key](../../apps/newframe/src/features/accounts/main/index.ts#L1253-L1267)

## What is represented

`TransactionSimulation` has a status, optional flat effects, source, error, and timestamp. Each effect contains asset kind, direction, positive magnitude, token metadata, and display text. It does not retain an affected address, transfer counterparty, or per-account grouping. [Domain contract](../../apps/newframe/src/features/transactions/domain/index.ts#L46-L79)

The trace parser temporarily retains ERC-20 `{ token, from, to, amount }` records. It walks every nested call, skips each trace node that carries its own `error` or `revertReason`, reads ERC-20 `Transfer` logs, and falls back to decoded `transfer` and `transferFrom` calls only when the trace has no matching logs. It then nets transfers by token for one supplied account. [Trace walk](../../apps/newframe/src/features/transactions/main/simulation.ts#L147-L175), [call fallback](../../apps/newframe/src/features/transactions/main/simulation.ts#L177-L208), [netting](../../apps/newframe/src/features/transactions/main/simulation.ts#L227-L242), [log preference](../../apps/newframe/src/features/transactions/main/simulation.ts#L449-L457)

Native effects use the same single-account rule. Every successful nested call with value subtracts from its sender and adds to its recipient when either matches the requested account. The emitted effect stores only direction and absolute amount. [Native netting](../../apps/newframe/src/features/transactions/main/simulation.ts#L210-L225), [native effect](../../apps/newframe/src/features/transactions/main/simulation.ts#L329-L348)

Token metadata comes from the canonical token catalog first, request recognition second, and an ERC-20 RPC lookup last. Failure still produces a generic `Token` effect without decimals. [Metadata sources](../../apps/newframe/src/features/transactions/main/simulation.ts#L244-L327), [token effect](../../apps/newframe/src/features/transactions/main/simulation.ts#L350-L380)

`getTransactionEffects` is the common presentation and finalization transform. A successful nonempty simulation replaces deterministic incoming and outgoing effects, while deterministic allowance effects remain. Without simulation it derives outgoing native value, recognized ERC-20 transfers, decoded `transfer(address,uint256)`, and allowance changes from request data. These deterministic transfer paths are sender-relative only. [Deterministic effects](../../apps/newframe/src/features/transactions/domain/index.ts#L201-L304), [simulation merge](../../apps/newframe/src/features/transactions/domain/index.ts#L307-L340)

On successful confirmation, Newframe filters that result to `in` and `out` effects and saves it as `balanceChanges`. Allowance effects are `neutral`, so they are not finalized as balance changes. Gas is calculated separately from the receipt and stored as `gasSpent`. Reverted activity gets an empty `balanceChanges` array. [Fee calculation](../../apps/newframe/src/features/transactions/domain/index.ts#L371-L381), [finalization](../../apps/newframe/src/features/accounts/main/index.ts#L551-L587)

These are simulated or deterministic effects attached to a finalized status, not effects reconstructed from the mined transaction. Simulation calls `debug_traceCall` against `latest` before submission. Confirmation fetches only block height and the receipt, then finalization reuses `req.simulation`; it does not trace the mined transaction or parse receipt logs. [Trace request](../../apps/newframe/src/features/transactions/main/simulation.ts#L382-L423), [confirmation RPCs](../../apps/newframe/src/features/accounts/main/index.ts#L1101-L1124), [finalization reuse](../../apps/newframe/src/features/accounts/main/index.ts#L563-L578)

## Submission paths

### Prompted RPC transaction

`eth_sendTransaction` becomes a `TransactionRequest`, is classified, and enters `Accounts.routeRequest`. `FrameAccount.addRequest` starts recipient lookup, calldata decoding, action recognition, and simulation. Recognition finishes before simulation starts. [Provider request creation](../../apps/newframe/src/features/connections/main/provider/index.ts#L853-L929), [request enrichment](../../apps/newframe/src/features/accounts/main/Account.ts#L521-L555), [simulation sequencing](../../apps/newframe/src/features/accounts/main/Account.ts#L407-L431)

After approval and broadcast, the request service calls `Accounts.setTxSent`. That creates canonical activity, starts monitoring, updates the receipt and confirmations, then freezes the current computed effects into `balanceChanges` on success. Late enrichment can update the submitted activity while its request still exists. [Approval completion](../../apps/newframe/src/features/requests/main/service.ts#L137-L159), [submitted transaction](../../apps/newframe/src/features/accounts/main/index.ts#L1839-L1854), [activity sync](../../apps/newframe/src/features/accounts/main/index.ts#L466-L491), [confirmation finalization](../../apps/newframe/src/features/accounts/main/index.ts#L1340-L1350)

### Send panel and onchain trade preparation

The send panel builds either a native transfer or ERC-20 transfer, then calls the shared side-tray transaction service. That service emits `eth_sendTransaction` through the provider, so it follows the prompted path above. ERC-20 sends also pass token metadata into the request context. [Send construction and submit](../../apps/newframe/src/features/transactions/send/main/service.ts#L199-L221), [shared side-tray provider call](../../apps/newframe/src/features/transactions/main/sideTrayService.ts#L69-L110), [composition](../../apps/newframe/src/app/main/composition/production.ts#L339-L364)

Trade `wrap` and `approve` preparation transactions use the same side-tray service. Final Flash order submission signs typed data and calls the Flash service, so it creates an order, not transaction activity. [Trade preparation transaction](../../apps/newframe/src/features/transactions/trade/main/service.ts#L305-L359), [order submission](../../apps/newframe/src/features/transactions/trade/main/service.ts#L365-L453), [shared composition](../../apps/newframe/src/app/main/composition/production.ts#L365-L385)

### Replacement transaction

Speed-up and cancel create a new internal `eth_sendTransaction` request, so they also use the prompted path. Same-nonce cleanup removes losing pending activity only after a receipt identifies a winner. [Replacement request](../../apps/newframe/src/features/accounts/main/index.ts#L1016-L1064), [same-nonce cleanup](../../apps/newframe/src/features/accounts/main/index.ts#L1180-L1210)

### Autonomous agent transaction

The agent endpoint accepts `eth_sendTransaction` and calls `sendAgentTransaction`. Authorization routes it through the autonomous callback instead of `FrameAccount.addRequest`, then signing and broadcast call `trackAutonomousTransaction` directly. As a result, this path does not run recipient lookup, action recognition, calldata decoding, or simulation. [Agent dispatch](../../apps/newframe/src/features/agent-access/main/index.ts#L253-L276), [autonomous request](../../apps/newframe/src/features/connections/main/provider/index.ts#L610-L665), [sign, broadcast, and tracking](../../apps/newframe/src/features/connections/main/provider/index.ts#L804-L850), [autonomous routing](../../apps/newframe/src/features/accounts/main/index.ts#L1685-L1709), [activity tracking](../../apps/newframe/src/features/accounts/main/index.ts#L1719-L1729)

Finalization can still derive a native outgoing value from the raw request. It has no general ERC-20 delta source on this path because the request starts with empty recognized actions and no simulation. [Agent request fields](../../apps/newframe/src/features/connections/main/provider/index.ts#L642-L660), [deterministic native and ERC-20 inputs](../../apps/newframe/src/features/transactions/domain/index.ts#L201-L239)

### Raw signed transaction

`eth_sendRawTransaction` is protected at the local RPC boundary but has no provider-specific handler. It falls through to the chain connection and never calls an activity recorder. The raw transaction also lacks the request metadata used by simulation. [Protected method list](../../apps/newframe/src/platform/local-rpc/protectedMethods.ts#L1-L17), [provider dispatch and fallback](../../apps/newframe/src/features/connections/main/provider/index.ts#L1539-L1551), [connection fallback](../../apps/newframe/src/features/connections/main/provider/index.ts#L1606-L1614)

## Coverage by transaction kind

Simulation runs for every prompted `TransactionRequest` with a chain ID. Classification does not gate it. Contract deployment is the exception because `simulateTransactionEffects` returns unavailable when `data.to` is absent. [Request reveal branch](../../apps/newframe/src/features/accounts/main/Account.ts#L521-L531), [deployment guard](../../apps/newframe/src/features/transactions/main/simulation.ts#L462-L477), [classifications](../../apps/newframe/src/features/transactions/main/index.ts#L186-L195)

For requests with a destination, current trace coverage includes nested native value movements and ERC-20 transfers observable through standard `Transfer` logs or decoded `transfer` and `transferFrom` calls. The parser has no balance snapshot comparison and emits only `native` and `erc20` effects. This excludes arbitrary token standards and state changes unless they appear in one of those forms. [Trace shape and walkers](../../apps/newframe/src/features/transactions/main/simulation.ts#L60-L74), [transfer extraction](../../apps/newframe/src/features/transactions/main/simulation.ts#L154-L208), [effect kinds](../../apps/newframe/src/features/transactions/domain/index.ts#L46-L60)

If `debug_traceCall` is unavailable, the simulation becomes `unavailable`. A traced revert becomes `error`. Final activity then falls back to the deterministic request transform described above. [Simulation status handling](../../apps/newframe/src/features/transactions/main/simulation.ts#L426-L440), [trace result handling](../../apps/newframe/src/features/transactions/main/simulation.ts#L479-L512), [fallback selection](../../apps/newframe/src/features/transactions/domain/index.ts#L307-L315)

## Where account information is lost

1. `extractTransfersFromLogs` and `extractTransfersFromCalls` retain both endpoints, but `tokenDeltasFromTransfers` accepts one account and returns only `Map<token, delta>`. [Extraction](../../apps/newframe/src/features/transactions/main/simulation.ts#L154-L208), [reduction](../../apps/newframe/src/features/transactions/main/simulation.ts#L227-L242)
2. `nativeDeltaFromTrace` also reduces directly to one scalar for one account. [Native reduction](../../apps/newframe/src/features/transactions/main/simulation.ts#L210-L225)
3. `TransactionEffect` cannot identify the account whose balance changed. [Effect type](../../apps/newframe/src/features/transactions/domain/index.ts#L46-L60)
4. `simulateTransactionEffects` returns only that flat effect array and discards the trace. [Simulation return](../../apps/newframe/src/features/transactions/main/simulation.ts#L497-L503)
5. Activity uses the transaction hash as both key and ID, then stores one `account` and one `balanceChanges` list. A second record for the same hash overwrites the first. [Hash ID](../../apps/newframe/src/features/accounts/main/index.ts#L74-L76), [record](../../apps/newframe/src/features/accounts/main/index.ts#L323-L359), [upsert semantics](../../apps/newframe/src/platform/state-store/actions.ts#L357-L377)
6. The activity UI filters records by `record.account || record.address`, so the receiving account cannot see a sender-owned record even if that record's effects mention an inbound transfer. [Activity filter](../../apps/newframe/src/features/transactions/renderer/activity/activityModel.ts#L151-L183)

The wallet already scopes account discovery to the current profile. `getProfileAccountIds` selects accounts whose `profileId` matches, `Accounts` caches those IDs, and the wallet projection exposes only those accounts. Transaction review resolves its destination nickname against that projected account set. This is the existing source for the candidate account list. [Profile account selection](../../apps/newframe/src/app/contracts/state/main.ts#L206-L220), [active account cache](../../apps/newframe/src/features/accounts/main/index.ts#L240-L265), [wallet account projection](../../apps/newframe/src/platform/state-sync/main/projections.ts#L344-L375), [destination account lookup](../../apps/newframe/src/features/requests/renderer/Account/Requests/state.ts#L72-L86), [review use](../../apps/newframe/src/features/requests/renderer/Account/Requests/TransactionRequest/TxReview.tsx#L349-L375)

Canonical activity itself is global and persists across profiles. The wallet projection sends the full activity map; the view filters it by selected account. The side tray projects only the current account's activity. [Canonical state](../../apps/newframe/src/app/contracts/state/main.ts#L167-L195), [wallet projection](../../apps/newframe/src/platform/state-sync/main/projections.ts#L366-L382), [side-tray filter](../../apps/newframe/src/platform/state-sync/main/projections.ts#L562-L615)

## Persistence and renderer boundaries

The canonical activity schema allows one account/address and an array of native or ERC-20 `balanceChanges`. `selectPersistedState` carries `main.activity` through as durable state, and its test round-trips finalized gas and balance changes. [Activity schema](../../apps/newframe/src/app/contracts/state/main.ts#L63-L109), [persistence selection](../../apps/newframe/src/platform/state-store/persistence.ts#L211-L234), [round-trip test](../../apps/newframe/src/platform/state-store/persistence.test.ts#L200-L230)

The main process also stores request `simulation`, token data, classification, and recognized actions on activity records. The wallet IPC schema explicitly keeps `balanceChanges`, decoded display data, recipient, and recognized actions, but strips unlisted passthrough fields. Therefore renderer activity should treat finalized `balanceChanges` as the stable delta contract, not the stored simulation object. [Stored activity fields](../../apps/newframe/src/features/accounts/main/index.ts#L466-L490), [wallet activity projection schema](../../apps/newframe/src/platform/state-sync/contract/projections.ts#L346-L362), [projection stripping test](../../apps/newframe/src/platform/state-sync/contract/projections.test.ts#L124-L172)

No domain code generation owns this flow. The state and renderer projection schemas are handwritten Zod declarations. The only required generation in the normal typecheck is Panda CSS output from TSX files, written under `generated/styled-system`; a data-model-only change does not require a new generated contract. [State schema](../../apps/newframe/src/app/contracts/state/main.ts#L63-L109), [projection schema](../../apps/newframe/src/platform/state-sync/contract/projections.ts#L346-L362), [build scripts](../../apps/newframe/package.json#L12-L26), [Panda output](../../apps/newframe/panda.config.ts#L5-L15)

## Closest tests and fixtures

- `simulation.test.ts` is the closest trace fixture. It covers an internal `transferFrom`, request-provided metadata, canonical token metadata, and missing decimals. It currently asserts only the request account's outgoing effects. [Trace tests](../../apps/newframe/src/features/transactions/main/simulation.test.ts#L7-L94), [metadata tests](../../apps/newframe/src/features/transactions/main/simulation.test.ts#L96-L240)
- `Account.test.ts` proves recognition completes before simulation. [Sequencing test](../../apps/newframe/src/features/accounts/main/Account.test.ts#L246-L293)
- `accounts/main/index.test.ts` proves simulated effects become saved token positions and finalized `balanceChanges`, and covers persisted activity resumption and profile dormancy. [Finalized delta test](../../apps/newframe/src/features/accounts/main/index.test.ts#L757-L813), [resume test](../../apps/newframe/src/features/accounts/main/index.test.ts#L917-L956), [profile monitor test](../../apps/newframe/src/features/accounts/main/index.test.ts#L958-L1005)
- `transactions/domain/index.test.ts` covers simulation precedence, metadata repair, and unique position tokens. [Merge tests](../../apps/newframe/src/features/transactions/domain/index.test.ts#L301-L392), [position token test](../../apps/newframe/src/features/transactions/domain/index.test.ts#L395-L445)
- `activityModel.test.ts` covers exact account filtering and finalized balance labels. [Activity model tests](../../apps/newframe/src/features/transactions/renderer/activity/activityModel.test.ts#L11-L49)
- `state-sync/main/projections.test.ts` has an active-profile fixture with activity owned by two accounts. It proves account scoping and side-tray activity filtering, but not wallet activity visibility for a receiving account. [Profile fixture](../../apps/newframe/src/platform/state-sync/main/projections.test.ts#L154-L230), [projection assertions](../../apps/newframe/src/platform/state-sync/main/projections.test.ts#L232-L274)
- The visual send and trade stages verify that the submitted hash appears in canonical activity. They do not inspect a recipient account's activity. [Send stage](../../harness/newframe/visual/stages/send.ts#L251-L263), [trade preparation stage](../../harness/newframe/visual/stages/trade-market.ts#L104-L117)

The focused existing suites pass:

```text
cd apps/newframe
bun test --isolate --preload ./test/support/electron.preload.ts \
  ./src/features/transactions/main/simulation.test.ts \
  ./src/features/accounts/main/index.test.ts

41 pass, 0 fail
```

## Smallest runnable coverage probe

Add one test beside `#effectsFromTrace` in `simulation.test.ts`. Build a single trace containing a native transfer and an ERC-20 `Transfer` log from account A to account B. Call `effectsFromTrace` twice with the same trace, changing only `req.account`. Assert matching `out` effects for A and `in` effects for B. The disposable version of this probe passed in this checkout. It performs no RPC and isolates the exact data-loss boundary. [Exported function](../../apps/newframe/src/features/transactions/main/simulation.ts#L442-L460), [existing fixture style](../../apps/newframe/src/features/transactions/main/simulation.test.ts#L11-L94)

This is the disposable command that passed:

```sh
bun -e '
  import { effectsFromTrace } from "./apps/newframe/src/features/transactions/main/simulation.ts"
  const a = "0x1111111111111111111111111111111111111111"
  const b = "0x2222222222222222222222222222222222222222"
  const token = "0x3333333333333333333333333333333333333333"
  const topic = (address) => "0x" + "0".repeat(24) + address.slice(2)
  const trace = {
    from: a, to: b, value: "0x64",
    logs: [{
      address: token,
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        topic(a), topic(b)
      ],
      data: "0x32"
    }]
  }
  const base = {
    handlerId: "probe", type: "transaction", origin: "probe", payload: {},
    approvals: [], feesUpdatedByUser: false, recipientType: "contract",
    recognizedActions: [], classification: "CONTRACT_CALL",
    data: {
      chainId: "0x1", type: "0x2", gasFeesSource: "Frame",
      from: a, to: b, value: "0x64", data: "0x"
    }
  }
  const projection = { getNativeCurrency: () => ({}), getToken: () => undefined }
  for (const account of [a, b]) {
    console.log(account, await effectsFromTrace(
      trace, { ...base, account }, { symbol: "ETH", decimals: 18 }, projection
    ))
  }
'
```

That probe establishes reusable trace coverage, not the product behavior. The smallest product-level proof also needs one lifecycle test with two current-profile accounts and one hash. It should assert two independently addressable activity records, account-relative `balanceChanges`, one confirmation lifecycle, and no record for an account in another profile. Existing activity storage cannot satisfy that assertion until its identity scheme changes. [Profile selector](../../apps/newframe/src/app/contracts/state/main.ts#L206-L220), [hash-keyed activity](../../apps/newframe/src/features/accounts/main/index.ts#L74-L76), [account-filtered rendering](../../apps/newframe/src/features/transactions/renderer/activity/activityModel.ts#L151-L183)

## Grounded change boundary

The trace work can stay inside the existing simulation pipeline. Preserve account association before `tokenDeltasFromTransfers` and `nativeDeltaFromTrace` collapse it, and use the current-profile account IDs already owned by `Accounts`. No second trace call or new chain API is required. [Current reducer](../../apps/newframe/src/features/transactions/main/simulation.ts#L210-L242), [simulation projection](../../apps/newframe/src/features/transactions/main/simulation.ts#L442-L503), [active profile IDs](../../apps/newframe/src/features/accounts/main/index.ts#L240-L265)

Activity storage needs an explicit decision. Either records need account-scoped IDs while retaining the transaction hash, or one transaction record needs per-account projections and the renderer must expand them. The first option matches the existing one-account activity renderer but requires separating monitor and notification identity from row identity. The second preserves `activity[hash]` but changes more renderer and state contracts. This is an architectural inference from the current hash-keyed store, monitor, notification, and account filter. [Store key](../../apps/newframe/src/features/accounts/main/index.ts#L74-L79), [monitor state](../../apps/newframe/src/features/accounts/main/index.ts#L145-L152), [notification target](../../apps/newframe/src/features/accounts/main/index.ts#L361-L383), [renderer filter](../../apps/newframe/src/features/transactions/renderer/activity/activityModel.ts#L151-L183)

General prompted transactions with a destination are feasible with the current trace. Complete coverage also requires a deliberate policy for contract deployment, autonomous agent transactions, raw signed transactions, simulation failure, and pre-submit simulation drift. Those gaps are independent of account enumeration. [Deployment gap](../../apps/newframe/src/features/transactions/main/simulation.ts#L470-L477), [agent gap](../../apps/newframe/src/features/connections/main/provider/index.ts#L610-L665), [raw transaction fallback](../../apps/newframe/src/features/connections/main/provider/index.ts#L1606-L1614), [simulation failure states](../../apps/newframe/src/features/transactions/main/simulation.ts#L479-L512)
