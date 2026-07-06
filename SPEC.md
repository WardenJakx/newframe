# Transaction Handoff, Activity, and Status Notifications Spec

## Summary

Newframe should leave the transaction signing flow once a transaction has been submitted and a transaction hash is available. After that point, transaction progress is represented by:

- A transient, lightweight status notification on the main wallet page.
- A durable Activity tab record for every Newframe-submitted transaction hash.
- The reusable transaction detail/progress UI opened from Activity or from a notification click.

The notification framework must be generic enough for future async products such as swaps/orders. Transaction-specific state and nuance belongs in the transaction Activity model, not in the notification system.

## Goals

- Pop the transaction request overlay once a submitted transaction hash exists.
- Add a non-blocking stacked status notification framework on the main wallet page.
- Persist Newframe-submitted transactions into Activity, ordered by timestamp and scoped to the selected wallet.
- Make Activity the canonical place to inspect transaction progress after submission.
- Reuse the existing transaction progress/detail UI through a shared `TransactionInformation` surface.
- Keep the design simple enough to implement in phases.

## Non-Goals

- Do not replace the existing blocking `Notify` modal system for warnings and confirmation prompts.
- Do not backfill Activity from historical chain data or external wallet activity.
- Do not persist transient notifications across restarts.
- Do not add per-wallet Activity clearing. Global reset is enough.
- Do not optimize near-instant notification completion behavior in this pass.
- Do not build a full notification center.

## Transaction Flow

The transaction request overlay remains active through signing and broadcast. It should pop only after the app has a concrete transaction hash.

Current lifecycle mapping:

- Stay in transaction flow for pre-hash states such as ready-to-sign, signer prompt, pending signature, signing, sending, signing error, broadcast error, insufficient funds, or user-declined signing.
- At the first reliable submitted-hash event, create/persist the Activity record, create the pending notification, then immediately pop the visible transaction overlay.
- Do not force the user into Activity after submission. Reveal whatever main wallet surface was underneath the request overlay.
- Activity continues tracking the transaction after the request overlay closes.

This requires an explicit UI pop separate from the transaction data lifecycle. Closing the request view must not remove the live transaction tracking data.

## Transaction Lifecycle Events

Transaction lifecycle events originate in the main process because signing, broadcast, and monitoring live there. Renderer components should not infer lifecycle by scraping request status.

Use a small domain-level event vocabulary:

- `transaction:submitted`: hash is known; create Activity row and pending notification; pop transaction overlay.
- `transaction:updated`: confirmations, receipt, status, or display data changed.
- `transaction:finalized`: transaction reached a terminal on-chain state.
- `transaction:pruned`: lifecycle event emitted when the tracker has positive evidence a submitted hash can no longer land. Remove it from Activity/tracking. The notification layer may ignore this and let any pending notification expire naturally.
- `transaction:removed`: internal live-request cleanup only; this is not the same as deleting Activity history.

Consumers:

- Activity persistence consumes events into `main` state.
- Status notifications consume events into transient `view` state.
- The transaction request/live monitor continues to own signing and chain-status mechanics.

## Status Notifications

### Scope

Status notifications are lightweight, event-driven UI. They should not own transaction logic and should not understand replacement semantics beyond receiving add/update/finalize/prune events.

Notification states are only:

- `pending`
- `completed`
- `failed`

Feature-specific systems, such as transactions or future swaps, own nuanced statuses in their own source of truth.

### Placement

Render a new `StatusNotifications` component inside `Home`, not top-level `Panel`.

Behavior:

- Non-blocking stack near the top of the main wallet page, below account/header controls and above balance/action content.
- Deeper overlays, request views, position/detail screens, settings, and other pushed screens must appear above the stack.
- The notification container should be click-through except for notification rows.
- Notifications ignore the current network filter and selected account filter.
- If the user clicks a transaction notification for another account, select that account first, then open the transaction detail in Activity.

### Stack Behavior

- Newest notification at the top.
- Show about 3 visible notifications at once.
- Additional active notifications may remain in transient state and become visible as older rows dismiss.
- Rows use stable height and stable icon/title/detail regions.
- Pending uses the existing loading spinner style.
- Completed uses a green check.
- Failed uses a red x.
- Extract the spinner/check/x glyphs into reusable status glyph components for notifications and transaction detail.
- CSS-only transitions: fade/slide in, smooth stack reflow, fade out.

### Timers

- Pending notifications expire after 60 seconds from creation.
- Completed/failed notifications fade out 3 seconds after resolution.
- If a pending notification expires, later events do not resurrect it.
- Timers continue running even if the stack is covered by another screen.
- Clicking a notification does not dismiss it.
- Manual dismiss removes the current visual row only; it does not unsubscribe from the tracked notification. Future updates for the same notification may show again until terminal state or 60-second expiry.

### Payload Shape

Keep the generic payload simple:

- `id`: stable notification id.
- `state`: `pending | completed | failed`.
- `title`: stable primary text.
- `detail`: concise secondary text.
- `leadingIcon`: optional metadata, such as chain icon.
- `createdAt`, `updatedAt`, `expiresAt`.
- `target`: optional navigation target.

Do not put arbitrary React content in notification payloads.

## Transaction Notifications

Transaction notifications are created only after a submitted transaction hash exists.

Display:

- Pending row: status spinner, chain icon, `Pending`, transaction title, and short hash or nonce.
- Completed/failed row: keep the transaction title stable and change only state label/icon.
- Clicking opens the durable Activity transaction detail for that hash.

Transaction notifications are per submitted transaction hash. If Newframe submits a speed-up or cancel replacement and receives a new hash, that submitted hash gets its own notification.

Mapping:

- Activity `succeeded` -> notification `completed`.
- Activity `reverted` -> notification `failed`.
- Signing/broadcast failures before a hash exists -> no Activity row and no transaction status notification.
- Same-nonce losers that are pruned because they can no longer land -> no failed notification; let any visible pending notification expire naturally.

## Activity

### Purpose

Activity is the durable transaction history for Newframe-submitted transactions. It replaces the current empty placeholder behavior.

Rules:

- Activity is scoped to the selected wallet/account.
- Activity rows respect the current network filter. All Networks shows all chains for the selected wallet; a specific network filters by chain.
- Activity shows every Newframe-submitted transaction hash while it can land or after it lands.
- Activity is ordered by submission timestamp.
- Activity is not affected by notification expiry.
- Activity does not include external transactions that were not submitted through Newframe.
- Global `Reset All Settings & Data` clears Activity with the rest of persisted app data.

### Persistence

Durable Activity lives under `main`, for example `main.activity` or `main.transactionActivity`, so it is persisted through the existing store pipeline and cleared by global reset.

Add a zod schema for Activity records to `MainSchema`.

Older persisted configs should default to an empty Activity collection. There is no historical backfill.

### Activity Record

Use a stable internal activity id for each submitted transaction hash record. Do not use chain transaction hash as the only durable key if the implementation needs internal references.

Persist enough data to render Activity without depending on RPC once terminal:

- Internal activity id.
- Account/wallet address.
- Chain type and chain id.
- Origin.
- Current transaction hash.
- Nonce.
- Submitted timestamp.
- Last updated timestamp.
- Terminal timestamp when applicable.
- Status.
- Receipt when available.
- Confirmations while non-terminal.
- Raw transaction data.
- Display title/subtitle.
- Decoded action/effects if available.
- Replacement/prune metadata if relevant.

Do not persist callback/responder fields or ephemeral approval UI state.

### Statuses

Activity owns transaction statuses for submitted hashes. Keep this status set small:

- `submitted`
- `confirming`
- `succeeded`
- `reverted`

Use `succeeded` when the transaction lands with receipt status `0x1`. The UI can still show confirmation progress before treating the transaction as final.

Use `reverted` when a transaction lands and receipt status is `0x0`.

Do not use an Activity `failed` state for signing or broadcast failures. Those happen before a submitted hash exists, so they remain in the transaction flow and should not create an Activity row.

Do not use an Activity `cancelled` state. A cancellation is just another submitted transaction hash. If the cancellation transaction lands successfully, show it as `succeeded`.

### Tracking

While the app is running:

- Non-terminal Activity records continue to poll/subscribe for receipt and confirmation updates.
- Terminal records persist all final data locally and stop polling.

After restart:

- Restore background tracking for non-terminal Newframe Activity records.
- Do not restore notifications.
- Once a restored record becomes terminal, persist final data and stop polling.

## Replacement, Speed-Up, Cancel, and Pruning

Ethereum same-nonce replacements are competing transactions. Only one transaction for the same account + chain + nonce can land. Losing same-nonce transactions do not revert on-chain; they never get a receipt.

Product rule:

- Activity tracks submitted transactions that can still land or did land.
- If a submitted transaction becomes impossible to land, prune it from Activity and stop tracking it.
- Do not keep dropped dead hashes for archaeology.

Pruning should not be based only on one failed transaction-hash lookup. A pending transaction can be unavailable from a given RPC for temporary or provider-specific reasons. Prune only when the tracker has positive evidence that the hash cannot land, such as:

- another same-account, same-chain, same-nonce transaction has landed; or
- the account nonce has advanced past the transaction nonce and this hash still has no receipt.

Speed-up:

- Newframe submits a new transaction with the same nonce and higher gas.
- The speed-up transaction has a new hash and gets its own Activity row and notification.
- The original transaction remains pending/tracked until the app can determine it can no longer land.
- Once the original is known to be dropped/replaced, prune the original Activity row and its tracking subscription.

Cancel:

- Newframe submits a new same-nonce cancellation transaction, usually a 0-value self-send.
- The cancel transaction has a new hash and gets its own Activity row and notification.
- The original transaction remains pending/tracked until the app can determine it can no longer land.
- Once the original is known to be dropped/replaced, prune the original Activity row and its tracking subscription.
- If the cancel transaction lands successfully, its Activity row shows `succeeded`.

Notifications:

- Notifications are per submitted hash.
- Replacement/cancel submissions get new notifications.
- Original pending notifications still expire after 60 seconds.
- Pruning a non-landed same-nonce loser should not turn its notification into a failed notification. If the original pending notification is still visible, it can remain governed by the normal 60-second pending expiry.

## TransactionInformation Component

Create a reusable transaction detail/progress surface from the existing transaction panel UI.

Goals:

- Preserve current transaction layout, progress display, and actions where practical.
- Reuse the same display for the transaction submission flow and Activity detail.
- Abstract the data source, not the entire user experience.

Containers:

- Submission container passes live request data.
- Activity detail container passes persisted/polled Activity data.

The component may keep existing action affordances such as speed up, cancel, open explorer, and copy hash. Side effects can remain in the surrounding container or existing action paths as needed; the purpose is reuse, not a purity rewrite.

## UI/UX Details

- Activity empty state remains `No Activity Yet`.
- Pending notification rows should feel compact and scannable.
- Notification copy should stay generic and short.
- The chain icon disambiguates network because notifications ignore the network filter.
- Activity detail is the place for full transaction state, actions, explorer links, hashes, confirmations, receipt details, and replacement/cancel nuance.

## Implementation Milestones

1. Design/structure the transient status notification store and `StatusNotifications` component.
2. Add generic notification actions under transient `view` state.
3. Create reusable status glyph components for spinner/check/x.
4. Emit `transaction:submitted` at the hash handoff point.
5. On `transaction:submitted`, create Activity row, create pending notification, and pop the visible transaction overlay.
6. Add durable Activity schema/state under `main` with empty defaults.
7. Render Activity rows for submitted transactions, scoped to selected wallet and filtered by network.
8. Add Activity detail navigation from notifications and Activity rows.
9. Extract/reuse `TransactionInformation` for submission and Activity detail.
10. Mirror transaction updates/finalization into Activity and notifications.
11. Resume non-terminal Activity tracking after restart.
12. Implement same-nonce pruning when a submitted transaction can no longer land.

## Protocol Notes

- Ethereum transactions include an account nonce. Same-sender same-chain same-nonce submissions compete; only one can land.
- `eth_getTransactionReceipt` returns no receipt while a transaction is pending/not included.
- Receipt `status` of `0x1` means successful execution.
- Receipt `status` of `0x0` means the transaction landed but execution failed/reverted.

References:

- [ethereum.org: Transactions](https://ethereum.org/developers/docs/transactions/)
- [ethereum.org: JSON-RPC `eth_getTransactionReceipt`](https://ethereum.org/developers/docs/apis/json-rpc/#eth_gettransactionreceipt)
- [MetaMask: Speed up or cancel a pending transaction](https://support.metamask.io/manage-crypto/transactions/how-to-speed-up-or-cancel-a-pending-transaction/)
- [Geth command-line options: txpool price bump](https://geth.ethereum.org/docs/fundamentals/command-line-options)
