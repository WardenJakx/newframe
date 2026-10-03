import { z } from 'zod'

const noParams = z.tuple([])
const hex = z.string().regex(/^0x[\da-f]*$/i)
const address = z.string().regex(/^0x[\da-f]{40}$/i)
const hash = z.string().regex(/^0x[\da-f]{64}$/i)
const quantity = z.string().regex(/^0x[\da-f]+$/i)
const blockTag = z.union([quantity, z.enum(['earliest', 'latest', 'pending', 'safe', 'finalized'])])
const block = z.union([
  blockTag,
  z.strictObject({ blockHash: hash, requireCanonical: z.boolean().optional() }),
  z.strictObject({ blockNumber: quantity })
])
const object = z.record(z.string(), z.unknown())
// Wallet handlers retain their domain validation and compatibility errors after admission.
const walletParams = z.array(z.unknown())
const signParams = z.array(z.unknown()).min(2).max(3)
const filter = z
  .object({
    fromBlock: blockTag.optional(),
    toBlock: blockTag.optional(),
    blockHash: hash.optional(),
    address: z.union([address, z.array(address)]).optional(),
    topics: z.array(z.union([hash, z.array(hash), z.null()])).optional()
  })
  .strict()

interface RpcMethodPolicy {
  params: z.ZodType
  permission: 'public' | 'source' | 'account' | 'internal'
  route: 'handler' | 'chain' | 'envelope' | 'unsupported' | 'extension' | 'transport'
  aiSession?: boolean
}
const chain = (params: z.ZodType): RpcMethodPolicy => ({ params, permission: 'public', route: 'chain' })
const handler = (
  params: z.ZodType,
  permission: RpcMethodPolicy['permission'],
  aiSession = false
): RpcMethodPolicy => ({ params, permission, route: 'handler', aiSession })

/** The complete local RPC allowlist. Unknown methods are never forwarded to a chain node. */
const rpcMethods: Record<string, RpcMethodPolicy> = {
  eth_accounts: handler(noParams, 'account'),
  eth_requestAccounts: handler(noParams, 'account'),
  eth_sendTransaction: handler(z.tuple([object]), 'account', true),
  eth_sendRawTransaction: handler(z.tuple([hex]), 'account'),
  personal_sign: handler(signParams, 'account', true),
  personal_ecRecover: handler(signParams, 'account'),
  eth_signTypedData: handler(signParams, 'account', true),
  eth_signTypedData_v1: handler(signParams, 'account'),
  eth_signTypedData_v3: handler(signParams, 'account', true),
  eth_signTypedData_v4: handler(signParams, 'account', true),
  eth_sign: { params: walletParams, permission: 'source', route: 'unsupported' },
  eth_signTransaction: { params: walletParams, permission: 'source', route: 'unsupported' },
  wallet_addEthereumChain: handler(walletParams, 'account'),
  wallet_switchEthereumChain: handler(walletParams, 'source'),
  wallet_getEthereumChains: handler(noParams, 'account'),
  wallet_getAssets: handler(walletParams, 'account', true),
  wallet_getPermissions: handler(walletParams, 'account'),
  wallet_requestPermissions: handler(walletParams, 'account'),
  wallet_watchAsset: handler(object, 'account'),
  frame_getOriginStatus: handler(noParams, 'source'),
  frame_disconnectOrigin: handler(noParams, 'source'),
  frame_summon: { params: noParams, permission: 'source', route: 'extension' },
  frame_requestExtensionConnection: { params: noParams, permission: 'source', route: 'extension' },
  frame_getExtensionAccounts: { params: noParams, permission: 'source', route: 'extension' },
  frame_selectExtensionAccount: { params: z.tuple([address]), permission: 'source', route: 'extension' },
  frame_requestExtensionAccounts: { params: noParams, permission: 'source', route: 'extension' },
  eth_pollSubscriptions: {
    params: z.tuple([z.string(), z.literal('immediate').optional()]),
    permission: 'source',
    route: 'transport'
  },
  eth_chainId: handler(noParams, 'public'),
  net_version: handler(noParams, 'public'),
  web3_clientVersion: handler(noParams, 'public'),
  eth_getTransactionByHash: handler(z.tuple([hash]), 'public'),
  // These route either to Newframe's subscriptions or to the chain node.
  eth_subscribe: chain(
    z.union([
      z.tuple([z.literal('newPendingTransactions'), z.boolean().optional()]),
      z.tuple([
        z.enum([
          'newHeads',
          'logs',
          'syncing',
          'networkChanged',
          'chainChanged',
          'chainsChanged',
          'accountsChanged',
          'assetsChanged'
        ]),
        object.optional()
      ])
    ])
  ),
  eth_unsubscribe: chain(z.tuple([z.string()])),
  wallet_request: { params: object, permission: 'public', route: 'envelope' },
  caip_request: { params: object, permission: 'public', route: 'envelope' },

  web3_sha3: chain(z.tuple([hex])),
  net_listening: chain(noParams),
  net_peerCount: chain(noParams),
  eth_protocolVersion: chain(noParams),
  eth_syncing: chain(noParams),
  eth_blockNumber: chain(noParams),
  eth_gasPrice: chain(noParams),
  eth_maxPriorityFeePerGas: chain(noParams),
  eth_blobBaseFee: chain(noParams),
  eth_feeHistory: chain(z.tuple([quantity, blockTag, z.array(z.number().min(0).max(100)).optional()])),
  eth_getBalance: chain(z.tuple([address, block])),
  eth_getStorageAt: chain(z.tuple([address, quantity, block])),
  eth_getTransactionCount: chain(z.tuple([address, block])),
  eth_getCode: chain(z.tuple([address, block])),
  eth_getProof: chain(z.tuple([address, z.array(hex), block])),
  eth_call: chain(z.tuple([object, block.optional(), object.optional(), object.optional()])),
  eth_estimateGas: chain(z.tuple([object, block.optional(), object.optional()])),
  eth_createAccessList: chain(z.tuple([object, blockTag.optional()])),
  eth_getBlockByHash: chain(z.tuple([hash, z.boolean()])),
  eth_getBlockByNumber: chain(z.tuple([blockTag, z.boolean()])),
  eth_getBlockTransactionCountByHash: chain(z.tuple([hash])),
  eth_getBlockTransactionCountByNumber: chain(z.tuple([blockTag])),
  eth_getUncleCountByBlockHash: chain(z.tuple([hash])),
  eth_getUncleCountByBlockNumber: chain(z.tuple([blockTag])),
  eth_getTransactionByBlockHashAndIndex: chain(z.tuple([hash, quantity])),
  eth_getTransactionByBlockNumberAndIndex: chain(z.tuple([blockTag, quantity])),
  eth_getTransactionReceipt: chain(z.tuple([hash])),
  eth_getBlockReceipts: chain(z.tuple([z.union([blockTag, hash])])),
  eth_getUncleByBlockHashAndIndex: chain(z.tuple([hash, quantity])),
  eth_getUncleByBlockNumberAndIndex: chain(z.tuple([blockTag, quantity])),
  eth_getLogs: chain(z.tuple([filter])),
  eth_newFilter: chain(z.tuple([filter])),
  eth_newBlockFilter: chain(noParams),
  eth_newPendingTransactionFilter: chain(z.tuple([z.boolean().optional()])),
  eth_uninstallFilter: chain(z.tuple([quantity])),
  eth_getFilterChanges: chain(z.tuple([quantity])),
  eth_getFilterLogs: chain(z.tuple([quantity])),
  // Newframe's own simulations use a main-process source. External debug/admin RPC is not exposed.
  debug_traceCall: {
    params: z.tuple([object, block, object.optional()]),
    permission: 'internal',
    route: 'chain'
  }
}

export function rpcMethodPolicy(method: string): RpcMethodPolicy | undefined {
  return Object.hasOwn(rpcMethods, method) ? rpcMethods[method] : undefined
}

export const accountAccessMethods = Object.keys(rpcMethods).filter(
  (method) => rpcMethods[method].permission === 'account'
)
