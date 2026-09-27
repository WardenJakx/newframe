# Flash API package

`@newframe/flash` owns Flash assets, chain support, request and response mapping, HTTP calls, and the order stream. Desktop and the CLI call `createFlashApi` directly. The client accepts a base URL, runtime profile, and `fetch` implementation; it has no Desktop state or wallet dependency.

Zod function schemas validate client and protocol helper arguments when called. Their inferred types catch invalid calls at compile time; runtime parsing covers CLI JSON and HTTP data. Successful HTTP and WebSocket payloads are parsed at the network boundary. Business rules such as supported chains and cross-chain order types stay in the protocol builder.

Desktop handles canonical orders, rate observations, and polling around the client. The CLI handles approved sessions, signatures, and submission recovery around the same client.
