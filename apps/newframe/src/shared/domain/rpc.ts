import type { NativeCurrency as ChainNativeCurrency } from '../../features/networks/domain/state/nativeCurrency.ts'
import type {
  LegacyTypedData,
  TransactionReceipt,
  TypedData
} from '../../features/requests/contract/requests.ts'
import type { Address } from './address.ts'

export type RPCResponsePayload = JSONRPCSuccessResponsePayload & JSONRPCErrorResponsePayload

export type RPCCallback<T extends RPCResponsePayload> = (res: T) => void
export type RPCErrorCallback = RPCCallback<JSONRPCErrorResponsePayload>
export type RPCSuccessCallback = RPCCallback<JSONRPCSuccessResponsePayload>
export type RPCRequestCallback = RPCCallback<RPCResponsePayload>

export interface RPCId {
  id: string | number
  jsonrpc: '2.0'
}

interface InternalPayload {
  _origin: string
}

export interface JSONRPCRequestPayload extends RPCId {
  params: readonly unknown[]
  method: string
  chainId?: string
}

interface JSONRPCSuccessResponsePayload extends RPCId {
  result?: unknown
}

interface JSONRPCErrorResponsePayload extends RPCId {
  error?: EVMError
}

export interface EVMError {
  message: string
  code?: number
}

export type RPCRequestPayload = JSONRPCRequestPayload & InternalPayload

export declare namespace RPC {
  namespace SignTypedData {
    interface Request extends Omit<RPCRequestPayload, 'method' | 'params'> {
      method: 'eth_signTypedData' | 'eth_signTypedData_v1' | 'eth_signTypedData_v3' | 'eth_signTypedData_v4'
      params: [string, LegacyTypedData | TypedData | string, ...unknown[]]
    }

    interface Response extends Omit<RPCResponsePayload, 'result'> {
      result?: string
    }
  }

  namespace BlockNumber {
    interface Response extends Omit<RPCResponsePayload, 'result'> {
      result?: string
    }
  }

  namespace GetTransactionReceipt {
    interface Response extends Omit<RPCResponsePayload, 'result'> {
      result?: TransactionReceipt & {
        status?: string
      }
    }
  }

  namespace GetAssets {
    interface Balance {
      chainId: number
      name: string
      symbol: string
      balance: string
      decimals: number
      displayBalance: string
    }

    interface NativeCurrency extends Balance {
      currencyInfo: ChainNativeCurrency
    }

    interface Erc20 extends Balance {
      tokenInfo: {
        lastKnownPrice?: { usd: { price: number; change24hr?: number } }
      }
      address: Address
    }

    interface Assets {
      erc20?: Erc20[]
      nativeCurrency: Balance[]
    }

    interface Request extends Omit<RPCRequestPayload, 'method'> {
      method: 'wallet_getAssets'
    }

    interface Response extends Omit<RPCResponsePayload, 'result'> {
      result?: Assets
    }
  }

  namespace GetEthereumChains {
    interface Color {
      r: number
      g: number
      b: number
      hex: string
    }

    interface WalletMetadata {
      colors?: Color[]
    }

    interface Icon {
      url: string
      width?: number
      height?: number
      format?: 'png' | 'jpg' | 'svg'
    }

    interface NativeCurrency {
      name: string
      symbol: string
      decimals: number
    }

    interface Explorer {
      name?: string
      icon?: Icon[]
      url: string
      standard?: string
    }

    interface Chain {
      chainId: number
      networkId: number
      name: string
      icon: Icon[]
      connected: boolean
      nativeCurrency: NativeCurrency
      explorers: Explorer[]
      external: {
        wallet?: WalletMetadata
      }
    }

    interface Request extends Omit<RPCRequestPayload, 'method'> {
      method: 'wallet_getEthereumChains'
    }

    interface Response extends Omit<RPCResponsePayload, 'result'> {
      result?: Chain[]
    }
  }

  namespace SendTransaction {
    interface TxParams {
      nonce?: string
      gasPrice?: string
      gas?: string // deprecated
      maxPriorityFeePerGas?: string
      maxFeePerGas?: string
      gasLimit?: string
      from?: Address
      to?: Address
      data?: string
      value?: string
      chainId: string
      type?: string
    }

    interface Request extends Omit<RPCRequestPayload, 'method'> {
      method: 'eth_sendTransaction'
      params: TxParams[]
    }
  }

  namespace Subscribe {
    interface Request extends Omit<RPCRequestPayload, 'method'> {
      method: 'eth_subscribe'
      params: string[]
    }
  }

  namespace Susbcription {
    interface Response {
      jsonrpc: '2.0'
      method: 'eth_subscription'
      params: { subscription: string; result?: unknown }
    }
  }
}
