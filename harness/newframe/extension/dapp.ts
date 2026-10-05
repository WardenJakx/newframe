import { toQuantity } from 'ethers'

import { anvilChainId, anvilRpcUrl } from '../core/config.ts'

export const dappUrl = 'http://dapp.newframe.test/'

export const sendRecipient = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65'
export const sendValueWei = 10_000_000_000_000_000n
// The harness seeds MockUSDC at the canonical USDC address on Anvil.
export const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
export const usdcSpender = '0x0000000000000000000000000000000000001337'
export const usdcAllowance = 25_000_000n
export const signedMessage = 'Sign in to Example dapp'
export const typedData = {
  domain: { name: 'Example dapp', version: '1', chainId: anvilChainId },
  types: { Greeting: [{ name: 'contents', type: 'string' }] },
  primaryType: 'Greeting',
  message: { contents: 'Hello from Example dapp' }
}

const dappConfig = {
  chain: {
    chainId: toQuantity(anvilChainId),
    chainName: 'Newframe Local Anvil',
    nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
    rpcUrls: [anvilRpcUrl],
    blockExplorerUrls: []
  },
  send: { to: sendRecipient, value: toQuantity(sendValueWei) },
  usdc: { address: usdcAddress, spender: usdcSpender, amount: toQuantity(usdcAllowance) },
  message: signedMessage,
  typedData: JSON.stringify({
    ...typedData,
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' }
      ],
      ...typedData.types
    }
  })
}

type DappConfig = typeof dappConfig

/** Runs in the dapp page, serialized with `toString()`, so it may use only browser globals and its argument. */
function dappMain(config: DappConfig) {
  type Provider = {
    request(args: { method: string; params?: unknown[] }): Promise<unknown>
    on(event: string, listener: (value: unknown) => void): void
  }

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null
  const isProvider = (value: unknown): value is Provider =>
    isRecord(value) && typeof value.request === 'function' && typeof value.on === 'function'
  const describeError = (error: unknown) =>
    isRecord(error) && typeof error.message === 'string' ? error.message : String(error)

  const heading = document.createElement('h1')
  heading.textContent = 'Example dapp'
  const outputs = document.createElement('dl')
  const output = (label: string) => {
    const term = document.createElement('dt')
    term.textContent = label
    const value = document.createElement('output')
    value.setAttribute('aria-label', label)
    const definition = document.createElement('dd')
    definition.append(value)
    outputs.append(term, definition)
    return value
  }
  const account = output('Account')
  const chain = output('Chain')
  const result = output('Result')
  const error = output('Error')
  const actions = document.createElement('div')
  document.body.append(heading, actions, outputs)

  let provider: Provider | undefined
  const accountsFrom = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

  window.addEventListener('eip6963:announceProvider', (event) => {
    const detail: unknown = event instanceof CustomEvent ? event.detail : undefined
    if (provider || !isRecord(detail) || !isRecord(detail.info) || detail.info.rdns !== 'sh.newframe') {
      return
    }
    if (!isProvider(detail.provider)) {
      return
    }
    provider = detail.provider
    provider.on('connect', (info) => {
      if (isRecord(info) && typeof info.chainId === 'string') {
        chain.value = info.chainId
      }
    })
    provider.on('accountsChanged', (accounts) => {
      account.value = accountsFrom(accounts)[0] ?? ''
    })
    provider.on('chainChanged', (chainId) => {
      chain.value = String(chainId)
    })
  })
  window.dispatchEvent(new Event('eip6963:requestProvider'))

  const action = (label: string, run: (provider: Provider, from: string) => Promise<unknown>) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.addEventListener('click', () => {
      result.value = ''
      error.value = ''
      if (!provider) {
        error.value = 'Newframe is not available'
        return
      }
      run(provider, account.value).then(
        (value) => {
          result.value = typeof value === 'string' ? value : JSON.stringify(value)
        },
        (reason: unknown) => {
          error.value = describeError(reason)
        }
      )
    })
    actions.append(button)
  }
  const hex = (text: string) =>
    `0x${Array.from(new TextEncoder().encode(text), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
  const word = (value: string) => value.replace(/^0x/, '').padStart(64, '0')

  action('Connect', async (wallet) => {
    const accounts = accountsFrom(await wallet.request({ method: 'eth_requestAccounts' }))
    account.value = accounts[0] ?? ''
    return accounts
  })
  action('Add Anvil chain', async (wallet) => {
    await wallet.request({ method: 'wallet_addEthereumChain', params: [config.chain] })
    await wallet.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: config.chain.chainId }]
    })
    chain.value = String(await wallet.request({ method: 'eth_chainId' }))
    return chain.value
  })
  action('Sign message', (wallet, from) =>
    wallet.request({ method: 'personal_sign', params: [hex(config.message), from] })
  )
  action('Sign typed data', (wallet, from) =>
    wallet.request({ method: 'eth_signTypedData_v4', params: [from, config.typedData] })
  )
  action('Send ETH', (wallet, from) =>
    wallet.request({ method: 'eth_sendTransaction', params: [{ from, ...config.send }] })
  )
  action('Approve USDC', (wallet, from) =>
    wallet.request({
      method: 'eth_sendTransaction',
      // approve(address,uint256)
      params: [
        {
          from,
          to: config.usdc.address,
          data: `0x095ea7b3${word(config.usdc.spender)}${word(config.usdc.amount)}`
        }
      ]
    })
  )
}

/** A small dapp that uses Newframe only through the provider the extension injects. */
export function dappHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Example dapp</title>
    <link rel="icon" href="data:," />
    <style>
      body { font: 14px system-ui, sans-serif; margin: 24px; }
      button { margin: 0 8px 8px 0; }
      dd { margin: 0 0 8px; font-family: ui-monospace, monospace; overflow-wrap: anywhere; min-height: 1.2em; }
    </style>
  </head>
  <body>
    <script>(${dappMain.toString()})(${JSON.stringify(dappConfig)})</script>
  </body>
</html>
`
}
