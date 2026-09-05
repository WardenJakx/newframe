# Chain addition RPC behavior

Checked 2026-09-05 against primary specifications and this checkout.

- **Add:** EIP-3085 specifies `wallet_addEthereumChain`. Successful addition must return `null`; unsuccessful addition returns an error. Its security guidance calls for explicit user consent and a requester-identifying confirmation. Keeping the request pending until approval and successful addition, or rejection, follows that contract. RPC URLs must be validated against `eth_chainId`. Addition does not guarantee selection; automatic switching is not required. EIP status: Stagnant, Standards Track: Interface. [EIP-3085](https://eips.ethereum.org/EIPS/eip-3085)
- **Switch:** EIP-3326 specifies `wallet_switchEthereumChain`. Success returns `null` after switching the active chain, which is the chain receiving forwarded RPC requests. The wallet must be able to service requests on the target chain. This readiness requirement concerns switching; EIP-3085 does not mandate waiting for a selected-chain connection after adding. EIP status: Stagnant, Standards Track: Interface. [EIP-3326](https://eips.ethereum.org/EIPS/eip-3326)
- **Provider:** EIP-1193 requires request promises to resolve with the method's specified result or reject with a provider error. Its error conventions assign `4001` to user rejection. A provider chain change must emit `chainChanged` with the hexadecimal chain ID. EIP status: Final. [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193)

## Local finding

`resolveNetwork` already waits for the approval command. Approval validates the RPC chain ID, adds the network, then resolves the pending request; rejection supplies error `4001`. It previously called `resolveRequest(request)` without an explicit result, supplying `undefined` instead of the specified `null`. The handler now explicitly returns `null`, with tests covering new chains and reactivation of existing chains. Sources: [request service](../../apps/newframe/src/features/requests/main/service.ts), [tests](../../apps/newframe/src/features/requests/main/service.test.ts).

This establishes a return-value mismatch, not the cause of the reported refresh workaround. The exact website flow has not been reproduced. Not switching automatically is not itself an EIP-3085 violation.
