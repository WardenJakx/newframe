# Newframe

Shared language for Newframe's product, the participants that request operations from it, and the authority those participants carry.

## Product terms

**Newframe**:
The product as a whole: the desktop app, the extension, and the Newframe CLI.
_Avoid_: App, Frame, wallet (when meaning the whole product)

**Desktop app**:
The Newframe application installed on the human's computer. It holds accounts and signers, prompts the human, and serves the local API.
_Avoid_: App, desktop (alone), Frame

**Profile**:
A named group of accounts. Exactly one profile is active at a time.
_Avoid_: Workspace, wallet cluster

**Account**:
An address Newframe tracks in a profile: a watch-only address, a Safe wallet, or an EOA backed by a signer.
_Avoid_: Wallet (as a catch-all), address

**Signer**:
A source of signatures that can sign for one or more accounts, such as a hot wallet or hardware wallet.
_Avoid_: Key, signing account

**Hot wallet**:
A signer whose key material is stored on the device itself: a private key, mnemonic, or keystore.
_Avoid_: Software wallet, local signer

**Hardware wallet**:
A signer whose key stays on an offline device. Supported: Trezor, Ledger, GridPlus, and AirGap.
_Avoid_: Cold wallet

**Safe wallet**:
A Gnosis Safe multi-signature wallet.
_Avoid_: Multisig (as a type name), Gnosis wallet

**Safe owner**:
An address authorized by a Safe wallet to confirm its transactions. A Safe owner can be one of the human's own accounts or belong to someone else.
_Avoid_: Signer (when meaning a Safe owner), cosigner

**Safe proposal**:
A Safe wallet transaction awaiting confirmations from Safe owners before it can execute.
_Avoid_: Safe request, pending Safe transaction

**Network**:
An EVM blockchain Newframe connects to, identified by its chain ID.
_Avoid_: Chain

**Local API**:
The desktop app's local HTTP and WebSocket interface for programs on the same computer. It is distinct from the desktop app's connection to a network.
_Avoid_: Local RPC, native RPC

## Participants

**Human**:
The person who controls the wallet and can approve a specific operation or delegate bounded authority.
_Avoid_: User (in authority contexts)

**Dapp**:
A web application that requests Newframe operations through the extension. A dapp remains untrusted after receiving account access.
_Avoid_: Website, site, trusted origin

**Extension**:
The Newframe browser extension, which relays dapp requests with a browser-derived dapp origin and can also request operations for itself. Approval to connect the extension does not approve a dapp's operations.
_Avoid_: Companion extension, dapp, caller

**Local API client**:
A program connected to the local API, such as the extension, Hardhat, Foundry, or the Newframe CLI.
_Avoid_: Native RPC client, chain RPC client

**Newframe CLI**:
Newframe's command-line client. Its primary current use is creating and using AI sessions.
_Avoid_: AI session

## Identity and authority

**Request source**:
The participant on whose behalf Newframe receives a request. A local API client can relay a request for another source, as the extension does for a dapp; an AI session supplies authority, not a requester.
_Avoid_: HTTP client, IPC message

**Dapp origin**:
The browser origin of the dapp that initiated a request. The extension takes it from the browser rather than from the dapp, so the dapp cannot choose it.
_Avoid_: Website origin, extension identity, display name

**Relayed dapp request**:
A dapp request carried by the extension with a browser-derived dapp origin. The request keeps the dapp as its source and cannot inherit extension-owned authority.
_Avoid_: Relayed website request, extension-owned operation

**Extension-owned operation**:
A gateway operation requested by the extension for its own health or settings, without a dapp source or dapp origin.
_Avoid_: Relayed dapp request

**Extension approval**:
The human's permission for the extension to connect to Newframe. It is separate from dapp permission and operation approval.
_Avoid_: Dapp approval, extension trust

**Extension account access**:
The accounts the human shares with the extension: either every account in the active profile or a chosen set that persists across profiles. The extension sees only shared accounts in the active profile, acts as its own selected account, and Newframe switches to that account before prompting for its operations.
_Avoid_: Extension approval, account access grant

**Account access grant**:
The human's permission for a request source to access a selected account. It does not approve a signing operation.
_Avoid_: Trusted dapp, signing approval

**AI session**:
A human-approved, bounded grant that lets an automated client perform operations within its approved scope without a fresh human prompt until expiry or revocation. Its client-supplied label is shown to the human but confers no authority.
_Avoid_: Agent access, agent session, CLI identity, indefinite permission

**AI session credential**:
A secret issued for an approved AI session that a local API client presents to exercise that session's authority. Possession does not extend its account, operation kinds, or duration.
_Avoid_: Client identity, AI session label

**AI session scope**:
The account, operation kinds, and duration the human approves for an AI session. An autonomous request must remain within that scope.
_Avoid_: Session scope, AI session label

**Operation approval**:
The human's explicit decision on a particular gateway operation. It is separate from identifying the software that submitted the decision.
_Avoid_: Action approval, extension approval, dapp permission

## Boundaries and operations

**Gateway**:
The single place where Newframe decides whether a requested gateway operation may proceed, based on the operation, its data, and the request source's authority.
_Avoid_: Entire main process, HTTP server

**Gateway operation**:
A requested Newframe operation with a defined intent, scope, and authorization policy, independent of the transport or interface that submitted it. Reads, grants, signing, and internal controls can each be gateway operations.
_Avoid_: Wallet action, JSON-RPC method, IPC message

**Protected gateway operation**:
A gateway operation involving private information, sensitive effects, or delegated authority that requires source-bound permission, a bounded grant, or fresh human approval. Protected does not mean a new prompt on every call.
_Avoid_: Always-prompted operation
