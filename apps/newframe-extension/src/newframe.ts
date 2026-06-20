import EventEmitter from 'events'
import InjectedFrameProvider from './provider'

declare const __NEWFRAME_EIP6963_ICON__: string

function pageMessageTargetOrigin() {
  return window.location.origin === 'null' ? '*' : window.location.origin
}

function setProvider() {
  const existingProvider = Object.getOwnPropertyDescriptor(window, 'ethereum')

  if (existingProvider?.configurable) {
    Object.defineProperty(window, 'ethereum', {
      value: provider,
      writable: true,
      configurable: true,
      enumerable: true
    })
  } else {
    ;(window as any).ethereum = provider
  }
}

function shimWeb3(provider: any, appearAsMetaMask: any) {
  let loggedCurrentProvider = false

  if (!(window as any).web3) {
    const SHIM_IDENTIFIER = appearAsMetaMask ? '__isMetaMaskShim__' : '__isNewframeShim__'

    const shim = { currentProvider: provider }
    Object.defineProperty(shim, SHIM_IDENTIFIER, {
      value: true,
      enumerable: true,
      configurable: false,
      writable: false
    })

    const web3Shim = new Proxy(shim, {
      get: (target, property, ...args) => {
        if (property === 'currentProvider' && !loggedCurrentProvider) {
          loggedCurrentProvider = true
          console.warn(
            'You are accessing the Newframe window.web3.currentProvider shim. This property is deprecated; use window.ethereum instead.'
          )
        } else if (property !== 'currentProvider' && property !== SHIM_IDENTIFIER) {
          console.error(
            `You are requesting the "${property as string}" property of window.web3 which no longer supported; use window.ethereum instead.`
          )
        }
        return Reflect.get(target, property, ...args)
      },
      set: (...args) => {
        console.warn(
          'You are accessing the Newframe window.web3 shim. This object is deprecated; use window.ethereum instead.'
        )
        return Reflect.set(...args)
      }
    })

    Object.defineProperty(window, 'web3', {
      value: web3Shim,
      enumerable: false,
      configurable: true,
      writable: true
    })
  }
}

class Connection extends EventEmitter {
  constructor() {
    super()

    this.handleMessage = this.handleMessage.bind(this)

    window.addEventListener('message', this.handleMessage)

    setTimeout(() => this.emit('connect'), 0)
  }

  handleMessage(event: MessageEvent) {
    if (event && event.source === window && event.data) {
      const { type } = event.data

      if (type === 'eth:payload') {
        this.emit('payload', event.data.payload)
      }

      if (type === 'eth:event') {
        this.emit(event.data.event, ...event.data.args)
      }
    }
  }

  send(payload: any) {
    window.postMessage({ type: 'eth:send', payload }, pageMessageTargetOrigin())
  }

  close() {
    window.removeEventListener('message', this.handleMessage)
  }
}

let mmAppear: any =
  window.localStorage.getItem('__newframeAppearAsMM__') || window.localStorage.getItem('__frameAppearAsMM__')

try {
  mmAppear = JSON.parse(mmAppear)
} catch (e) {
  mmAppear = false
}

let provider: InjectedFrameProvider | undefined

if (mmAppear) {
  try {
    provider = new InjectedFrameProvider(new Connection())
    provider.isMetaMask = true
    provider._metamask = {
      isUnlocked: () => new Promise((resolve) => resolve(true))
    }
    provider.setMaxListeners(0)
  } catch (e) {
    console.error('Newframe Error:', e)
  }
} else {
  try {
    provider = new InjectedFrameProvider(new Connection())
    provider.isNewframe = true
    provider.isFrame = true
    provider.setMaxListeners(0)
  } catch (e) {
    console.error('Newframe Error:', e)
  }
}

const info = {
  uuid: '2CFAB866-F2BF-45FB-B33E-DC94B0AC6DCD',
  name: 'Newframe',
  icon: __NEWFRAME_EIP6963_ICON__,
  rdns: 'sh.newframe'
}

function broadcastEvent(eventName: string, detail: any) {
  try {
    const event = new CustomEvent(eventName, { detail })
    window.dispatchEvent(event)
  } catch (err) {
    console.error(`Newframe could not dispatch ${eventName} event`, err)
  }
}

window.addEventListener('eip6963:requestProvider', () => {
  broadcastEvent('eip6963:announceProvider', Object.freeze({ info, provider }))
})

broadcastEvent('eip6963:announceProvider', Object.freeze({ info, provider }))

setProvider()

shimWeb3((window as any).ethereum, mmAppear)

const embedded: Record<string, (action: any) => Promise<any>> = {
  getChainId: async () => ({
    // use Newframe's own provider; window.ethereum may belong to another wallet
    chainId: await provider?.doSend('eth_chainId', [], undefined, false)
  })
}

document.addEventListener('readystatechange', () => {
  if (document.readyState === 'interactive') {
    setProvider()
  }
})

window.addEventListener('message', async (event) => {
  if (
    event &&
    event.source === window &&
    event.data &&
    event.data.type === 'embedded:action' &&
    window.self === window.top
  ) {
    if (event.data.action) {
      const action = event.data.action
      if (embedded[action.type]) {
        const res = await embedded[action.type]!(action)
        const payload = {
          method: 'embedded_action_res',
          params: [action, res]
        }
        window.postMessage({ type: 'eth:send', payload }, pageMessageTargetOrigin())
      } else {
        console.warn(`Could not find embedded action ${action.type}`)
      }
    }
  }
})
