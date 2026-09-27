# Newframe request authority

Target language for who requests Newframe operations, what authority they carry, and where Newframe decides whether an operation may proceed.

## Participants

**Human**:
The person who controls the wallet and can approve a specific operation or delegate bounded authority.

**Website**:
A web application that requests Newframe operations through the Companion extension. A website remains untrusted after receiving account access.
_Avoid_: Dapp, trusted origin

**Companion extension**:
Newframe's browser extension, which relays website requests with browser-derived website origin and can also request operations for itself. Approval to connect the extension does not approve a website's operations.
_Avoid_: Website, caller

**Local API client**:
A program connected to Newframe desktop's local HTTP or WebSocket API. This includes the Companion extension, Hardhat, Foundry, and the Newframe CLI; it is distinct from Newframe's upstream chain RPC connection.
_Avoid_: Native RPC client, chain RPC client

**Newframe CLI**:
Newframe's command-line client. Its primary current use is creating and using AI sessions.
_Avoid_: AI session

**Newframe-internal**:
A request initiated by Newframe's own renderer. Verifying the renderer as the source is distinct from approving a specific operation as a human.
_Avoid_: Wallet UI, human approval

**Main-process caller**:
A Newframe feature running in desktop main that requests a gateway operation directly. It is distinct from a Newframe-internal renderer request and still subject to gateway policy.
_Avoid_: Renderer, external client

## Identity and authority

**Request source**:
The participant on whose behalf Newframe receives a request. A local API client can relay a request for another source, as the Companion extension does for a website; an AI session supplies authority, not a requester.
_Avoid_: HTTP client, IPC message

**Website origin**:
The browser origin of the website that initiated a request. The Companion extension obtains it from browser-provided sender context and carries it alongside the website's requested operation; the website cannot choose it in its payload.
_Avoid_: Extension identity, display name

**Relayed website request**:
A website request carried by the Companion extension with browser-derived website origin. The request retains Website as its source and cannot inherit extension-owned authority.
_Avoid_: Extension-owned operation

**Extension-owned operation**:
A gateway operation requested by the Companion extension for its own health or settings, without a website source or website origin.
_Avoid_: Relayed website request

**Extension approval**:
The human's permission for a Companion extension to connect to Newframe. It is separate from website permission and operation approval.
_Avoid_: Website approval

**Account access grant**:
The human's permission for an identified request source to access a selected wallet account. It does not approve a signing operation.
_Avoid_: Trusted website, signing approval

**AI session**:
A human-approved, bounded grant that lets an automated client perform operations within its approved scope without a fresh human prompt until expiry or revocation.
_Avoid_: CLI identity, indefinite permission

**AI session credential**:
A secret issued for an approved AI session that a local API client presents to exercise that session's authority. Possession does not extend its account, operation kinds, or duration.
_Avoid_: Client identity, AI session label

**AI session scope**:
The account, operation kinds, and duration the human approves for an AI session. An autonomous request must remain within that scope.
_Avoid_: Session scope, AI session label

**AI session label**:
The client-supplied name shown to the human when an AI session is requested. The label does not confer authority.
_Avoid_: Session label, AI session identity

**Operation approval**:
The human's explicit decision on a particular gateway operation. It is separate from identifying the software that submitted the decision.
_Avoid_: Action approval, extension approval, website permission

## Boundaries and operations

**Entry point authorization layer**:
The desktop's transport-facing boundary for an incoming request. It admits the connection or sender, carries source evidence such as a browser-derived website origin into main, and passes the request to the Gateway; it does not decide whether the requested operation is allowed.
_Avoid_: Gateway

**Gateway**:
The first main-process application layer to read an incoming gateway request. It validates the requested operation and data, checks source authority such as website grants or AI session validity, then rejects it or forwards it to an IPC handler with bounded authorization context.
_Avoid_: Entire main process, IPC handler, HTTP server

**IPC handler**:
The main-process handler that performs an operation admitted by the Gateway. It can finish the work directly or create a pending operation for human review before calling a protected service.
_Avoid_: Gateway, renderer

**Protected operations service**:
The single main-process service for highest-sensitivity effects, including approved transaction signing or submission and private-key decryption or export; protected reads need not use it. It is a logical service inside Electron main, not a separate operating-system process.
_Avoid_: SecureProcess, renderer, Gateway

**Gateway operation**:
A requested Newframe operation with a defined intent, scope, and authorization policy, independent of the transport or interface that submitted it. Reads, grants, signing, and internal controls can each be gateway operations.
_Avoid_: Wallet action, JSON-RPC method, IPC message

**Protected gateway operation**:
A gateway operation involving private information, sensitive effects, or delegated authority that requires source-bound permission, a bounded grant, or fresh human approval. Protected does not mean a new prompt on every call.
_Avoid_: Always-prompted operation

## Visual checks

**Component preview**:
An isolated rendering of a Newframe desktop component from a fixture. It supports interaction and screenshots without launching the full app.

**Visual harness**:
Newframe's end-to-end visual check of the live development desktop app. It exercises user flows and captures screenshots of the resulting UI states.
