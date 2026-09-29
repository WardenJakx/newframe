# Desktop API boundary

Checked against tRPC v11 documentation on 2026-09-27; implementation revised 2026-09-28.

Ethereum HTTP/WebSocket JSON-RPC goes directly to the existing handler and authorization gateway. It never enters tRPC. First-party CLI and companion clients use native tRPC at `/trpc`; procedure implementations adapt once to existing gateway requests. Wallet services remain unchanged.

`@newframe/desktop-api` shares Zod schemas, concrete procedure types, and client factories. The generic RPC procedure remains for dynamic Ethereum methods whose results cannot be inferred from an arbitrary method string. [tRPC FAQ](https://trpc.io/docs/faq#can-i-dynamically-return-a-different-output-depending-on-what-input-i-send)

The migration replaces first-party request maps and response parsing with native clients. Agent session creation, status, and revocation use tRPC; the old `/agent/*` HTTP endpoints are removed. The USDC scenario also uses the shared client. The extension retains its website Ethereum bridge and shares persisted reconnect scheduling with its native tRPC connection.

## Library boundaries

- Vanilla clients need no React or Next.js. Client imports reference the router type without bundling desktop code. [Client setup](https://trpc.io/docs/client/vanilla/setup)
- Native Node HTTP and WebSocket adapters coexist with Ethereum transports. tRPC's wire format differs from Ethereum JSON-RPC. [HTTP adapter](https://trpc.io/docs/server/adapters/standalone), [WebSockets](https://trpc.io/docs/server/websockets)
- Input/output Zod schemas validate procedure boundaries. Server output validation does not automatically validate responses inside clients. [Validators](https://trpc.io/docs/server/validators)
- Authorization, session revocation, extension approval, and website origin attribution remain gateway responsibilities. [Context](https://trpc.io/docs/server/context), [Authorization](https://trpc.io/docs/server/authorization)
- Persisting backoff across extension worker restarts remains application code. tRPC handles request correlation and native subscription messages. [WebSocket client](https://trpc.io/docs/client/links/wsLink)

The earlier ts-rest attempt retained a custom socket transport under HTTP-shaped contracts. Native tRPC removes that first-party transport bookkeeping. It does not replace Ethereum RPC or make wallet internals require tRPC.
