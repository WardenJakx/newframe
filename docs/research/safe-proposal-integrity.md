# Safe proposal integrity

Checked 2026-09-09. Research only; no product changes.

## Recommendation

Add local Safe transaction hashing and reuse the existing calldata decoder. Show a prominent proposal-level error when the supplied hash disagrees or when service-decoded values provably disagree with the bytes. This is a modest, useful consistency check. It cannot establish that a compromised service supplied the proposal that owners intended.

Keep independent states for hash consistency and decoding. Unknown ABI, missing fields, unsupported version, and unavailable RPC are "unable to verify", not mismatches. Prefer local decoded values; identify any remaining service interpretation as service-provided. Avoid a generic "verified" badge.

Retain the offending proposal and attach its integrity result. Throwing from the current client would fail the whole queue refresh, while the [observation service](../../apps/newframe/src/features/accounts/main/safe.ts) retains old pending data with a deployment-level error. That would obscure the particular mismatch the user needs to inspect.

## Current checkout

- [Safe client](../../apps/newframe/src/platform/safe/client.ts) calls the Transaction Service directly with GET requests. It uses `/v1/safes/{address}/` and `/v2/safes/{address}/multisig-transactions/`. Production does not use Safe API Kit or Protocol Kit. The contract artifact dependency belongs to the [harness](../../harness/package.json).
- [Proposal schema](../../apps/newframe/src/features/accounts/domain/safe.ts) retains `safeTxHash`, `safe`, `nonce`, `to`, `value`, `operation`, `data`, confirmation owner addresses, and optional `dataDecoded`. Deployment state supplies chain ID and optional service-reported Safe version.
- The client discards `safeTxGas`, `baseGas`, `gasPrice`, `gasToken`, `refundReceiver`, and confirmation signature bytes. The present stored proposal cannot produce its Safe transaction hash correctly. Never silently fill missing hash fields with zero. Preserve legacy cached proposals as unverified until refresh, or invalidate that cache explicitly.
- `decodedDisplay` truncates and stringifies service parameters. That display representation is unsuitable as a general ABI encoding input. Arrays, tuple components, nested decoded calls, and long values require their original structure. Better to decode raw `data` locally than rebuild a transaction from these strings.
- [Details view](../../apps/newframe/src/features/requests/renderer/SafeProposalDetailsView.tsx) displays service hash and decoded parameters without comparing them. It computes plain `keccak256(data)` locally, which only fingerprints the calldata. Confirmation count and threshold also come from service data.

## What to hash

Build the standard `SafeTx` typed message with these fields in protocol order:

| Field          | Type    | Currently retained |
| -------------- | ------- | ------------------ |
| to             | address | Yes                |
| value          | uint256 | Yes                |
| data           | bytes   | Yes                |
| operation      | uint8   | Yes                |
| safeTxGas      | uint256 | No                 |
| baseGas        | uint256 | No                 |
| gasPrice       | uint256 | No                 |
| gasToken       | address | No                 |
| refundReceiver | address | No                 |
| nonce          | uint256 | Yes                |

The EIP-712 digest includes `keccak256(data)` within the struct, the domain separator, and the `0x1901` prefix. Safe 1.3.0 and 1.4.1 use a domain containing `chainId` and `verifyingContract`. The latter is the Safe proxy address. Neither `name` nor `version` belongs in this domain. [Safe 1.3.0 contract](https://github.com/safe-global/safe-smart-account/blob/v1.3.0/contracts/GnosisSafe.sol), [Safe 1.4.1 contract](https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/Safe.sol)

Safe 1.1.1 uses only `verifyingContract` in the domain. Protocol Kit selects the chain-ID domain at `>=1.3.0`. Version selects the encoding rule; it is not itself a hashed domain field. Use an explicit supported-version policy, and independently read `VERSION()` or `domainSeparator()` if claiming the rule matches the deployed contract. An optional service version alone is insufficient for that claim. [Safe 1.1.1 contract](https://github.com/safe-global/safe-smart-account/blob/v1.1.1/contracts/GnosisSafe.sol), [official Protocol Kit encoding](https://github.com/safe-global/safe-core-sdk/blob/main/packages/protocol-kit/src/utils/eip-712/index.ts)

The harness deploys Safe 1.5.0. Its hash structure remains the same, although `getTransactionHash` uses assembly. `checkSignatures` also has an executor-aware interface, so do not assume signature verification interfaces are identical across versions. [Harness deployment](../../harness/newframe/services/safe-contracts.ts), [Safe 1.5.0 contract](https://github.com/safe-global/safe-smart-account/blob/v1.5.0/contracts/Safe.sol)

Validate all integers as bounded uint256 decimal strings and retain precision. The existing 78-digit decimal limit alone does not enforce the uint256 maximum. Chain ID should come from the selected deployment and RPC context, and Safe address from the watched account, rather than accepting replacement identity from a response.

## Reuse already available

[Contract decoding](../../apps/newframe/src/platform/chain-rpc/contracts/index.ts) already calls `decodeFunctionData`, then `encodeFunctionData`, requiring exact byte equality. Reuse it through the [reveal service](../../apps/newframe/src/features/transactions/main/reveal.ts), which obtains an ABI through Sourcify/Etherscan and falls back to local or remote selector signatures. The calculation is local; some ABI inputs are fetched. A selector match and successful round trip establish an encoding interpretation, not contract behavior or asset safety. Colliding selectors remain ambiguous.

[Typed-data digests](../../apps/newframe/src/platform/signing/signatures/digests.ts) already compute EIP-712, domain, and message hashes. Constructing a `SafeTx` typed message can reuse this helper, or the existing ethers dependency directly. Its [tests](../../apps/newframe/src/platform/signing/signatures/digests.test.ts) already cross-check ethers `TypedDataEncoder`.

Do not substitute `getCalldataDigest` into Safe hashing. That helper hashes a 32-byte length prefix plus data; Safe hashes the raw data bytes. The Safe details view currently uses the latter.

[ERC-7730](../../apps/newframe/src/platform/signing/signatures/erc7730.ts) formats typed data using descriptors. It does not independently authenticate a Safe proposal or decode arbitrary inner calls. Reusing its display components is optional; integrating the descriptor registry is unnecessary for this check. For `multiSend(bytes)`, outer ABI round-trip still leaves packed inner transactions opaque. Full nested batch interpretation is separate scope; keep raw bytes and delegatecall warnings visible.

Compare machine values before formatting. Differences in parameter names, address casing, decimal formatting, or absent metadata are not evidence of altered calldata. Generic service-decoding comparison needs structured tuple/array support or an explicit limited supported subset. Unknown decoding must remain available as raw data.

## What the result establishes

A hash mismatch catches inconsistent fields, wrong domain selection, transport or adapter errors, and payload-only tampering. A local decode catches service descriptions inconsistent with the received bytes.

A service controlling both payload and claimed hash can change both consistently. Hash matching cannot prove owner approval, proposal origin, nonce freshness, queue completeness, or execution safety. A separate RPC `getTransactionHash` call confirms the deployed contract's hashing rule for the supplied fields, but does not authenticate their origin either.

Owner authorization requires checking signature bytes against the locally computed digest and independently read owner/threshold state. Safe supports EOA signatures, prefixed `eth_sign`, contract signatures, and approved hashes. Contract and approved-hash checks depend on chain state and executor context; recovering a few EOA addresses is not general Safe verification. This is a separate project from the proposed display check. [Official signature encoding](https://github.com/safe-global/safe-docs/blob/main/pages/advanced/smart-account-signatures.md), [Safe 1.4.1 signature checks](https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/Safe.sol)

## Effort and line counts

Measured existing file lengths with `wc -l`: client 189, domain schema 60, details view 81, contract decoder 156, digest helpers 50, ERC-7730 formatter 667. These are current physical lines, not added lines or savings.

Estimated product change for complete fields, a small typed-data builder, supported-version handling, local decoding, and explicit per-proposal status: **150–250 net production lines**, plus **100–180 focused test and fixture lines**. Estimate **1–2 engineering days**, including cache compatibility and visual checks. No Safe SDK dependency required. Unknown versions would remain unverified; independent onchain identity/configuration verification and full nested MultiSend decoding are outside this estimate.

An explicit structured comparison against arbitrary service-decoded tuples/arrays would add complexity with limited benefit over displaying the existing local decoder result. I would start with local display, hash mismatch errors, and semantic comparisons only where both representations are lossless. The valuable reuse is the 156-line decoder and 50-line digest helper; reproducing the 667-line formatter adds no integrity benefit.

The current [local service fixture](../../apps/newframe/scripts/local-safe/handler.ts) assigns fake hashes `0x...01` through `0x...04` and omits gas/refund fields. It tests observation and presentation, not cryptographic consistency. Meaningful verification needs complete fixtures with independently checked hashes, one-field mutations, missing fields, legacy domains, and mismatched decoded parameters.

## Adjacent UI assessment

The UI investigation found that Safe details already reuse the 485-line [TransactionInformation view](../../apps/newframe/src/features/requests/renderer/Account/Requests/TransactionRequest/TransactionInformation.tsx). Its 81-line adapter supplies Safe-specific rows. Replacing that adapter with the ordinary signing review would bring request, fee, and simulation dependencies without meaningful deletion.

The same investigation estimates 30–75 net production lines for chain icons, display-only local account nicknames, and a consistent displayed calldata digest. These are separate from integrity work. Existing [ChainIcon](../../apps/newframe/src/shared/renderer/ui/ChainIcon.tsx) and [AddressIdentity](../../apps/newframe/src/shared/renderer/ui/AddressIdentity.tsx) provide the main reuse. Optional refresh-handler cleanup could remove 5–15 lines. All change counts are estimates, not measured diffs.

Use local account nicknames only as presentation for the already reported addresses. Do not add onchain owner associations under the agreed scope. If the calldata digest label stays shared with ordinary review, make its calculation consistent across both screens while retaining the distinct Safe EIP-712 hash.

## Disposable experiment

An isolated Anvil instance on port 28545 deployed an actual Safe 1.5.0. Four inputs covered empty calldata, ERC-20 data with integers above JavaScript's safe range, an unknown delegatecall, and nonzero gas/refund fields. All four produced identical hashes through ethers, existing `getEip712Digests`, and the deployed Safe's `getTransactionHash`.

All ten transaction-field mutations and both domain-field mutations changed the digest. Existing `decodeCallData` preserved the large integer, rejected an appended byte, and returned no interpretation for an unknown selector. Changing the decoded amount produced different re-encoded bytes. The experiment also confirmed that the shared display digest differs from Safe's raw calldata hash.

Changing the payload and recomputing its advertised hash still passed the onchain hash comparison. This directly demonstrates the consistency/authenticity distinction above.

Scope was Safe 1.5.0 only. No legacy-version execution or signature verification was tested. The isolated process stopped cleanly and no production files changed. Temporary artifacts may be deleted by system cleanup: [results](/private/tmp/newframe-safe-assessment.4iMlHD/results.json), [probe](/private/tmp/newframe-safe-assessment.4iMlHD/probe.ts).
