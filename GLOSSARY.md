# Newframe

Shared language for Newframe's product, the participants that request operations from it, the authority those participants carry, and the parts of the system that own each responsibility.

## Language

### Product terms

**Newframe**:
The product as a whole: the desktop app, the extension, and the Newframe CLI.
_Avoid_: App, Frame, wallet (when meaning the whole product)

**Desktop app**:
The Newframe application installed on the human's computer. It holds accounts and signers, prompts the human, and serves the local API.
_Avoid_: App, desktop (alone), Frame

**Tray**:
A window of the desktop app through which the human views wallet state and makes decisions. There are two: the main tray and the side tray. Trays are Newframe's own code and are trusted to show what the core sent and carry the human's decisions back; they can carry a secret the human types or asks to see, but keep none.
_Avoid_: Renderer, interface, wallet window, wallet UI, frame

**Main tray**:
The primary tray, showing accounts, balances, and pending requests.
_Avoid_: Tray (when the side tray is also meant), home

**Side tray**:
The secondary tray for composing a send or trade beside the main tray.
_Avoid_: Panel, sidebar

**Profile**:
A named group of accounts that the human keeps apart from other groups. Exactly one profile is active at a time, and only the active profile's accounts take part in requests.
_Avoid_: Workspace, wallet cluster

**Account**:
An address Newframe tracks in a profile: a watch-only address, a Safe wallet, or an EOA backed by a signer.
_Avoid_: Wallet (as a catch-all), address

**Address book**:
The names the human gives to addresses in a profile, shown in place of those addresses. An address in the address book is not an account.
_Avoid_: Contacts, labels

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
A Gnosis Safe multi-signature wallet, tracked as one account. It has no signer of its own: its signatures come from its Safe owners.
_Avoid_: Multisig (as a type name), Gnosis wallet

**Safe owner**:
An address authorized by a Safe wallet to confirm its transactions. A Safe owner can be one of the human's own accounts or belong to someone else; Newframe signs for a Safe wallet only with Safe owners that are accounts in the active profile.
_Avoid_: Signer (when meaning a Safe owner), cosigner

**Safe proposal**:
A Safe wallet transaction awaiting confirmations from Safe owners before it can execute.
_Avoid_: Safe request, pending Safe transaction

**Chain**:
An EVM blockchain Newframe connects to, identified by its chain ID. Trays and the extension label it "network", as other wallets do; nothing else calls it that.
_Avoid_: Network (outside what the human sees)

**Selected chain**:
The one chain that requests use when they do not name a chain. There is a single selected chain for the whole desktop app, not one per dapp. The human can change it from a tray or from the extension.
_Avoid_: Selected network, active chain, dapp chain, origin chain

**Local API**:
The desktop app's local HTTP and WebSocket interface for programs on the same computer. It is distinct from the desktop app's connections to chains.
_Avoid_: Local RPC, native RPC, provider

### Participants

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
A program connected to the local API, such as the extension, Hardhat, Foundry, or the Newframe CLI. Unless it is the approved extension or presents an AI session credential, it has no identity Newframe can check: the name it gives is a label.
_Avoid_: Native RPC client, chain RPC client

**Newframe CLI**:
Newframe's command-line client. Its primary current use is creating and using AI sessions to trade. It talks to the trading service itself and comes to the desktop app only for signatures.
_Avoid_: AI session

**Remote service**:
A system outside the computer that Newframe fetches data from or submits to: a chain node, the Safe transaction service, a trading service, a portfolio or price source. It never requests operations. How far its responses are trusted is decided per remote service.
_Avoid_: Provider, backend, API (alone)

### Trust

**Trust zone**:
A region of the system whose code and data are trusted to the same degree. From least to most trusted: outside, relay, trays, core.
_Avoid_: Layer, tier

**Outside**:
The trust zone of everything Newframe does not control: dapps, local API clients, and remote services.

**Relay**:
The trust zone of the extension. It is trusted for one thing: reporting the true dapp origin of each dapp request it passes on. Such a request keeps the dapp as its request source and gains none of the extension's own authority.

**Core**:
Everything in the desktop app that is not a tray: where requests are decided and wallet state is kept. It is the most trusted zone.
_Avoid_: Main process, backend

**Boundary**:
A crossing from one trust zone into a more trusted one. Each boundary has one owner, which validates what crosses it; nothing behind the boundary validates it again.
_Avoid_: Layer, check, guard

**Owner**:
The single part of the system allowed to change a piece of state or make a kind of decision. Every other part reads it or asks the owner.
_Avoid_: Manager, controller

### Authority

**Request source**:
The participant on whose behalf Newframe receives a request. A local API client can relay a request for another source, as the extension does for a dapp; an AI session supplies authority, not a requester.
_Avoid_: HTTP client, IPC message, principal

**Dapp origin**:
The browser origin of the dapp that initiated a request. The extension takes it from the browser rather than from the dapp, so the dapp cannot choose it.
_Avoid_: Website origin, extension identity, display name, relay

**Extension approval**:
The human's permission for the extension to connect to Newframe. It is separate from dapp permission and operation approval.
_Avoid_: Dapp approval, extension trust

**Extension account access**:
The accounts the human lets the extension see at all: either every account in the active profile or a chosen set that persists across profiles. It is a ceiling, not a grant: a dapp still needs its own account access grant, and can only be granted an account the extension can see. The extension has no selection of its own: it acts as the selected account when that account is shared with it, and otherwise has no account until the human selects a shared one or shares more. From the extension the human can change the selected account to another one shared with it.
_Avoid_: Extension approval, account access grant

**Account access grant**:
The human's permission for one request source, such as a single dapp or a local API client, to access a selected account. It does not approve a signing operation, and a grant for a Safe wallet does not extend to its Safe owners.
_Avoid_: Trusted dapp, signing approval, dapp permission

**AI session**:
A human-approved, bounded grant that lets an automated client perform operations within its approved scope without a fresh human prompt until expiry or revocation. Its client-supplied label is shown to the human but confers no authority.
_Avoid_: Agent access, agent session, CLI identity, indefinite permission

**AI session credential**:
A secret issued for an approved AI session that a local API client presents to exercise that session's authority. Possession does not extend its account, operation kinds, or duration.
_Avoid_: Client identity, AI session label

**AI session scope**:
The account and duration the human approves for an AI session. Within them the session can have anything signed that the account can sign; it can never reveal a secret, change authority, or reach another account. The session is paused while its account's profile is not the active profile or while Newframe is locked.
_Avoid_: Session scope, AI session label

**Operation approval**:
The human's decision to allow one specific request, covering exactly the contents the human reviewed and nothing else. A request within an AI session's scope is approved by that session without a prompt.
_Avoid_: Action approval, extension approval, dapp permission

**Connected dapp**:
A dapp that holds at least one account access grant. Newframe keeps nothing else about a dapp.
_Avoid_: Known dapp, origin, trusted dapp

**Password confirmation**:
The human proving they are present, by re-entering the password or passing the device's biometric check, to allow one request that reveals a secret, such as exporting a private key. Being unlocked is not enough.
_Avoid_: 2FA, re-login, unlock

**Authority ledger**:
The single record of all authority the human has given: extension approval, extension account access, account access grants, AI sessions, and operation approvals. Authority that is not in the ledger does not exist.
_Avoid_: Permissions, trusted origins

**Lock**:
The state in which Newframe does nothing on anyone's behalf: the gateway admits no request except unlocking, the vault releases nothing, and nothing is sent to or read from a remote service. Newframe locks when the human locks it and when the computer's screen locks or it sleeps. Only the human can lift it.
_Avoid_: App lock, logged out

### Requests and operations

**Gateway operation**:
A kind of thing Newframe can be asked to do, with a defined intent, scope, and authorization policy, independent of the transport or interface used to ask. Reads, grants, signing, and internal controls can each be gateway operations.
_Avoid_: Wallet action, JSON-RPC method, IPC message, command

**Protected gateway operation**:
A gateway operation involving private information, sensitive effects, or delegated authority that requires an account access grant, an operation approval, or password confirmation. Protected does not mean a new prompt on every call.
_Avoid_: Always-prompted operation

**Operation catalog**:
The one list of every gateway operation, with its input, result, and authorization policy. An operation that is not in the catalog cannot be requested.
_Avoid_: Allowlist, RPC policy, method table

**Request**:
One instance of a gateway operation: a particular request source asking for it with particular contents, from arrival until it is answered, however long that takes. The gateway operation is the kind; the request is the occurrence.
_Avoid_: Call, message, payload

**Pending request**:
A request held until the human decides on it.
_Avoid_: Pending operation, account request, prompt

### Parts of the system

**Primitive**:
A shared part of the desktop app that every feature relies on and none can bypass: the entry points, gateway, vault, wallet services, state, internet, and desktop UI.
_Avoid_: Platform, infrastructure, shared

**Feature**:
One user-facing capability built on the primitives, such as sending, trading, or the Safe proposal queue. It owns its gateway operations, its screens, and any state or remote service that only it uses; it never identifies request sources, grants authority, or reaches the vault.
_Avoid_: Module, wallet service, primitive

**Entry point**:
The single way into the core for one kind of channel: trays, the extension, other local API clients, or AI session clients. It owns identifying who is on the channel and nothing about what they may do. For a tray that means confirming the message really came from a tray.
_Avoid_: Transport, handler, server

**Gateway**:
The single place where Newframe decides whether a requested gateway operation may proceed, based on the operation, its data, and the request source's authority. It owns the operation catalog's policy, the authority ledger, and pending requests, and it alone can ask the vault for a signature.
_Avoid_: Entire main process, HTTP server

**Vault**:
The hardened part of the core: the only part that holds secrets and signers, and the only part that releases a signature or an exported key. It answers only the gateway, checks the password or biometric itself whenever unlocking or password confirmation is required, and keeps every secret encrypted except for the moment it is used.
_Avoid_: Protected operations service, keystore, signer service

**Wallet service**:
A primitive that owns one area of wallet state shared by all features and is its only writer: chains, accounts, Safe wallets, assets, transactions, or settings. It alone talks to the remote services for its area and validates what they return, and it knows nothing about request sources or authority.
_Avoid_: Feature, store, manager

**Internet**:
The primitive that is the core's only way to reach a remote service. It decides whether an internet request may leave at all, which it may not while Newframe is locked, and how it leaves the computer. A connection to this computer never reaches the internet, so it is let through even while Newframe is locked.
_Avoid_: Network (that is a chain), outbound, transport, egress

**Internet request**:
One HTTP request or socket the core opens to a remote service through the internet. It is not a request: it has no request source and is not a gateway operation.
_Avoid_: Network request, outbound call, request (alone)

**Projection**:
The read-only view of wallet state that a tray receives. A tray sees nothing outside its projection.
_Avoid_: State sync, store mirror

**Desktop UI**:
The primitive that owns the desktop app's native interface around the trays: the windows that hold them, the menu bar icon, menus, shortcuts, and launch. What is shown inside a tray belongs to the trays, not to the desktop UI. It makes no wallet decisions.
_Avoid_: Desktop shell, shell, platform, desktop app (which is the whole application)

### Testing

**Virtual service**:
A local stand-in for something outside the core, such as a remote service or a dapp, that speaks its real protocol so the core runs unmodified against it. It is the only thing a test replaces.
_Avoid_: Mock, stub, fake, fixture server

**Visual harness**:
The built desktop app running against virtual services, driven through its trays as the human would, capturing a screenshot at each step.
_Avoid_: E2E suite, UI tests

**Boundary test**:
A test that sends hostile or malformed input across one boundary and checks that the boundary's owner refuses it.
_Avoid_: Unit test, security test

**Integration test**:
A test in the visual harness that carries one real use of Newframe from end to end and checks what the tray shows and the effect on the virtual service.
_Avoid_: Scenario, stage
