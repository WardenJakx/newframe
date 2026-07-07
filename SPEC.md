# Newframe Token Representation Unification Spec

## Goal

Unify token rendering across Newframe's positions, send, and trade flows so the same token representation is used everywhere a chain-aware token is shown or selected.

This is a hard migration. Positions, send, and trade should all move to the new shared components in the same implementation, and the old flow-specific renderers should be removed when no longer used.

## Scope

- Main positions token rows in `apps/newframe/app/tray/Home/index.tsx`.
- Send token selected state and token dropdown in `apps/newframe/app/dapp/Send/index.tsx`.
- Trade target/contra selected state and token dropdown in `apps/newframe/app/dapp/Trade/index.tsx`.
- Shared components under `apps/newframe/resources/Components`.

Out of scope:

- Refactoring unrelated shared components.
- Adding search/filter/pagination behavior to the shared selector.
- Supporting disabled token options.
- Adding custom trigger, custom className, placement, or styling escape hatches.
- Changing trade semantics, quote behavior, send validation, or positions filtering/dust behavior.

## Component Files

Create flat component files under `apps/newframe/resources/Components`:

- `ChainTokenIcon.tsx`
- `TokenOptionRow.tsx`
- `TokenSelector.tsx`
- `tokenSelectorTypes.ts` if shared types need their own file
- `TokenSelector.styl`

Update `apps/newframe/resources/Components/index.styl` to import `TokenSelector.styl`.

For this migration, use the convention "one component per file" and avoid creating a folder that only contains `index.tsx`. Do not refactor unrelated existing component folders.

## Shared Types

Use a normalized display item shape for rows/selectors:

```ts
export interface TokenSelectorItem {
  id: string
  symbol: string
  amountLabel: string
  notionalLabel: string
  chainId: number
  logoURI?: string
  rightSubLabel?: string
}
```

Rules:

- `id` is opaque and unique within the `items` array.
- Callers own filtering, sorting, slicing, and domain mapping.
- Callers pass already formatted `amountLabel` and `notionalLabel`.
- Do not include full token name or contract address in this display type.
- No disabled item support.

## ChainTokenIcon

`ChainTokenIcon` is the shared visual representation of a token on a chain.

Required behavior:

- Render the token image in a circular token icon when `logoURI` exists and loads.
- Render the first 5 characters of `symbol`, preserving casing, centered in the token circle when:
  - `logoURI` is absent,
  - `logoURI` fails to load.
- Render `?` only as a defensive fallback for an empty symbol.
- Render a chain badge at the top-left of the token circle.
- `chainId` is required. Missing chain IDs are developer misuse.
- Chain badge fallback order:
  - `networksMeta[chainId].icon`,
  - Ethereum glyph for Ethereum-like chain names,
  - colored dot using network primary color, falling back to `var(--moon)`.
- Broken token or chain image loads must:
  - fall back visually,
  - log a warning with useful context such as symbol, chainId, and URL,
  - reset failure state when the image URL changes.
- Do not add token-symbol-specific fallbacks like ETH or USDC glyphs. Missing token images always use the 5-character symbol fallback.
- Use `cachedImageUrl` for remote/cached images, matching existing behavior.
- Support only `sm` and `md` size presets.
  - `md` matches current positions/send row sizing: 38px token circle with a 22px chain badge.
  - `sm` is for compact selected-token buttons, matching the current trade-scale token affordance.
- Do not expose public `className` or styling override props.

## TokenOptionRow

`TokenOptionRow` is a presentational row. It is not a button and does not own click, keyboard, routing, or selection behavior.

Props:

```ts
interface TokenOptionRowProps {
  item: TokenSelectorItem
  networks: Record<string | number, NetworkLike>
  networksMeta: Record<string | number, NetworkMetaLike>
  showRightSubLabel?: boolean
}
```

Required layout:

- Left: `ChainTokenIcon` using `md`.
- Middle:
  - token symbol,
  - grey amount underneath.
- Right:
  - notional label.
- Optional right sublabel:
  - supported for positions price change,
  - suppressed by default in `TokenSelector`.
- No visible token full name.
- No visible chain name.
- No visible contract address.

## TokenSelector

`TokenSelector` is a controlled custom dropdown. Native `<select>` is not suitable because the UI requires images, two-line rows, right-aligned notional values, custom hover/focus states, and the shared chain token icon.

Props:

```ts
interface TokenSelectorProps {
  ariaLabel: string
  items: TokenSelectorItem[]
  selectedId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (id: string) => void
  networks: Record<string | number, NetworkLike>
  networksMeta: Record<string | number, NetworkMetaLike>
  footer?: React.ReactNode
}
```

Required behavior:

- Derive the selected item from `items` using `selectedId`.
- If `selectedId` is non-empty and not found in `items`:
  - log a warning,
  - render the cleared placeholder state,
  - callers should clear/reset invalid selection upstream.
- Placeholder state:
  - text: `Select token`,
  - no token icon,
  - show chevron,
  - opens the menu when `items` exist.
- If `items` is empty:
  - render the placeholder trigger in a disabled-looking state,
  - do not open a menu,
  - no in-menu empty state.
- Closed trigger:
  - fixed width, shared across send and trade,
  - `ChainTokenIcon` using `sm`,
  - selected token symbol,
  - chevron,
  - no chain name,
  - no full token name.
- Open menu:
  - fixed width of 336px,
  - `max-width: calc(100vw - 48px)`,
  - left/start aligned, matching existing send/trade behavior,
  - rows rendered with `TokenOptionRow`,
  - `rightSubLabel` suppressed by default.
- `onSelect` receives only the selected item id.
- Selecting an already-selected token closes the menu.
- Clicking outside closes the menu.
- Optional `footer` renders at the bottom of the menu. This supports send's existing "Show more assets" control without making pagination part of `TokenSelector`.
- No search/filter behavior.
- No disabled options.
- No custom trigger render prop.
- No public `className` API.

Accessibility requirements for the existing custom dropdown behavior:

- Selector requires `ariaLabel`.
- Trigger exposes `aria-expanded`.
- Use appropriate listbox/option roles for the popup and rows.
- Escape closes the menu.
- ArrowUp/ArrowDown moves through options.
- Enter/Space selects the focused option.
- When opened, focus/highlight starts at the selected item; if unavailable, use the first item.

## Flow Migration Requirements

### Positions

- Replace the local token icon renderer with `ChainTokenIcon`.
- Migrate visible token rows to `TokenOptionRow`.
- Keep existing positions behavior:
  - network filtering,
  - search matching,
  - dust/low-value hiding,
  - sorting,
  - click/keyboard activation opens asset details,
  - right-side notional value,
  - 24h price change as an optional `rightSubLabel`.
- Do not show full token names in rows.

### Send

- Remove `apps/newframe/app/dapp/Send/TokenIcon.tsx` if unused after migration.
- Use `TokenSelector` for selected token and dropdown options.
- Keep existing send behavior:
  - empty state when no sendable assets exist,
  - route asset preference when sendable,
  - fallback when route asset is not sendable,
  - max amount behavior,
  - validation and submit behavior,
  - visible-row slicing and "Show more assets" outside the selector, passed through as `footer`.
- Dropdown rows use the positions format:
  - icon,
  - symbol,
  - grey amount underneath,
  - notional value on the right.
- Remove visible chain name from the selected token button and dropdown rows.
- Remove full token name from token rows.

### Trade

- Remove the hardcoded `renderTradeAssetIcon` and `tradeAssetIcon*` styling for the selector.
- Use `TokenSelector` for target and contra asset selection.
- Keep trade-specific logic outside the shared components:
  - target/contra state,
  - buy/sell labels,
  - opposite-asset exclusion,
  - quote building,
  - quote invalidation,
  - balance lookup,
  - Flash asset logo enrichment.
- Trade-specific mapping may enrich Flash assets with `logoURI`, but the shared components must remain generic.
- Rows must not show full token name or contract address.
- Amount underneath symbol is the asset balance.
- Right-side notional is always currency-formatted. If a balance is nonzero but price data is missing, show `$0.00`.

## Styling Requirements

- Core token visuals use shared classes with prefixes such as `chainTokenIcon`, `tokenOptionRow`, and `tokenSelector`.
- Remove or narrow old flow-specific token representation classes that are no longer used:
  - send `sendTokenIcon*` where replaced,
  - trade `tradeAssetIcon*` where replaced,
  - positions token icon/row styling where replaced by shared classes.
- Keep colors and density consistent with the existing positions/send/trade dark UI.
- Do not add new UX beyond the unification described here.

## Verification

Primary verification should use the Newframe visual harness:

- Launch via `bun run harness:newframe` or `bun run dev` from `apps/newframe`.
- Visually verify:
  - positions rows,
  - send selected-token button,
  - send token menu,
  - trade target selector,
  - trade contra selector,
  - missing token-logo fallback with first 5 symbol characters preserving casing,
  - broken token/chain image fallback and warning behavior where practical.

Functional test guidance:

- Keep/migrate tests that cover still-relevant behavior.
- Delete or update tests that only assert removed design details.
- Preserve existing send tests for:
  - empty state,
  - route asset fallback,
  - route asset preference,
  - submit/validation behavior.
- Preserve existing trade tests for:
  - target/contra distinction,
  - quote invalidation,
  - account-change requoting,
  - non-market visual preview behavior.
- Add or migrate minimal component behavior coverage only where the visual harness cannot prove behavior, especially:
  - selector calls `onSelect(id)`,
  - Escape closes,
  - outside click closes,
  - Arrow/Enter keyboard selection works.

## Completion Criteria

- Positions, send, and trade all use the shared token representation.
- No old token icon/dropdown implementation remains for these flows.
- Visible token rows/selectors no longer show full token names or contract addresses.
- Missing token images show up to the first 5 symbol characters, preserving casing.
- Chain badges are consistently top-left.
- Send and trade use the same `TokenSelector` component and row format.
- Visual harness verification passes for the three flows.
- Relevant existing behavior tests still pass or are intentionally updated to match the new unified structure.
