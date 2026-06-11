// Ambient declarations for dependencies that ship no TypeScript types.
// Shapes are intentionally loose (any) — they describe how this codebase
// uses the modules, not the full library APIs.

declare module 'eth-provider' {
  import type { EventEmitter } from 'events'

  interface EthProvider extends EventEmitter {
    request: (payload: { method: string; params?: any }) => Promise<any>
    send: (...args: any[]) => any
    sendAsync: (payload: any, cb: (err: any, res?: any) => void) => void
    setChain?: (chainId: string | number) => void
    close?: () => void
    [key: string]: any
  }

  function provider(targets?: string | string[], options?: any): EthProvider
  export default provider
}

declare module 'ethereum-provider' {
  import type { EventEmitter } from 'events'

  export default class EthereumProvider extends EventEmitter {
    constructor(connection: any)
    request: (payload: { method: string; params?: any }) => Promise<any>
    enable: () => Promise<string[]>
    isConnected: () => boolean;
    [key: string]: any
  }
}

declare module 'nebula' {
  function nebula(ipfsGateway?: string, provider?: any): any
  export default nebula
}

declare module '@framelabs/pylon-client' {
  export default class Pylon {
    constructor(url: string)
    on: (event: string, cb: (...args: any[]) => void) => void
    subscribe: (...args: any[]) => any;
    [key: string]: any
  }
}

declare module 'eth-ens-namehash' {
  export function hash(name: string): string
  export function normalize(name: string): string
}

declare module 'content-hash' {
  export function decode(contentHash: string): string
  export function getCodec(contentHash: string): string
}
