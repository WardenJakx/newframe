import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

import createInitialState from '../store/state'
import createCanonicalStore from '../store/createCanonicalStore'
import { StateMessageChannel } from '../../contracts/state/protocol'
import { projectRendererState } from '../state/projections'
import { DEFAULT_PROFILE_ID } from '../../domain/state/main'
import { createStateStream, type StateStream } from './stateStream'

const authorizeRenderer = mock()

let stateStream: StateStream
let connectState: StateStream['connectState']
let store: ReturnType<typeof createCanonicalStore>['store']
const ipc = {
  handle: mock(),
  removeHandler: mock()
}

const actions = () =>
  Object.fromEntries(Object.entries(store.getState()).filter(([, value]) => typeof value === 'function'))

function createTestStore() {
  const storage: Parameters<typeof createCanonicalStore>[0] = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  }

  return createCanonicalStore(storage).store
}

function renderer(id = 1) {
  const sender = {
    id,
    isDestroyed: mock(() => false),
    once: mock(),
    send: mock()
  }

  return { event: { sender } as unknown as Electron.IpcMainInvokeEvent, sender }
}

beforeEach(() => {
  authorizeRenderer.mockReset()
  ipc.handle.mockReset()
  ipc.removeHandler.mockReset()
  store = createTestStore()
  stateStream = createStateStream({
    store,
    authorizeRenderer,
    projectRendererState
  })
  stateStream.registerHandlers(ipc)
  connectState = stateStream.connectState
})

afterEach(() => {
  stateStream.dispose()
})

describe('renderer state stream', () => {
  it('sends a strict flat wallet snapshot and excludes Electron-only and nested UI fields', () => {
    const { event, sender } = renderer()
    store.getState().updateLattice('device', { privKey: 'secret' })
    const state = store.getState()
    const accountId = '0x1111111111111111111111111111111111111111'
    store.setState({
      main: {
        ...state.main,
        futureCredential: 'must-not-cross-ipc',
        portfolioApiKey: 'secret-api-key',
        accounts: {
          ...state.main.accounts,
          [accountId]: {
            id: accountId,
            profileId: DEFAULT_PROFILE_ID,
            address: accountId,
            name: 'Wallet Account',
            lastSignerType: 'address',
            status: 'ok',
            signer: '',
            requests: {
              request: {
                type: 'sign',
                handlerId: 'request',
                authorization: {
                  decision: 'autonomous',
                  principal: {
                    type: 'agent',
                    origin: 'https://sensitive.example',
                    sessionId: 'secret-session'
                  }
                },
                futureCredential: 'must-not-cross-ipc'
              }
            },
            created: 'test:1',
            futureCredential: 'must-not-cross-ipc'
          }
        },
        signers: {
          ...state.main.signers,
          signer: {
            id: 'signer',
            name: 'Signer',
            model: 'test',
            type: 'hot',
            addresses: [accountId],
            status: 'ok',
            appVersion: { major: 1, minor: 0, patch: 0 },
            futureCredential: 'must-not-cross-ipc'
          }
        }
      },
      windows: {
        ...state.windows,
        futureWindowState: 'must-not-cross-ipc',
        panel: {
          ...state.windows.panel,
          futureWindowField: 'must-not-cross-ipc',
          nav: [
            {
              view: 'requestView',
              data: {
                accountId,
                requestId: 'request',
                request: {
                  origin: 'https://sensitive.example',
                  authorization: { principal: { sessionId: 'secret-session' } }
                },
                futureNavigationField: 'must-not-cross-ipc'
              }
            }
          ]
        }
      },
      tray: {
        ...state.tray,
        homeCommand: {
          id: 1,
          view: 'addChain',
          data: {
            chain: {
              id: 1,
              name: 'Ethereum',
              symbol: 'ETH',
              primaryRpc: 'https://rpc.example',
              futureChainField: 'must-not-cross-ipc'
            },
            requestId: 'request',
            request: {
              origin: 'https://sensitive.example',
              authorization: { principal: { sessionId: 'secret-session' } }
            },
            futureNavigationField: 'must-not-cross-ipc'
          }
        }
      },
      selected: { ...state.selected, futureSelection: 'must-not-cross-ipc' },
      view: { ...state.view, futureViewState: 'must-not-cross-ipc' }
    } as unknown as Parameters<typeof store.setState>[0])
    authorizeRenderer.mockReturnValue({ clientType: 'wallet-ui', webContentsId: sender.id })

    expect(connectState(event)).toEqual({ ok: true })
    expect(sender.send).toHaveBeenCalledTimes(1)

    const [channel, snapshot] = sender.send.mock.calls[0]
    expect(channel).toBe(StateMessageChannel)
    expect(snapshot).toMatchObject({ revision: 0, state: { currentAccount: '' } })
    expect(snapshot.streamId).toEqual(expect.any(String))
    expect(snapshot.state).not.toHaveProperty('main')
    expect(snapshot.state).not.toHaveProperty('lattice')
    expect(snapshot.state).not.toHaveProperty('futureCredential')
    expect(snapshot.state).not.toHaveProperty('portfolioApiKey')
    expect(snapshot.state.portfolioApiKeyConfigured).toBe(true)
    expect(snapshot.state.accounts[accountId]).not.toHaveProperty('futureCredential')
    expect(snapshot.state.accounts[accountId].requests.request).not.toHaveProperty('futureCredential')
    expect(snapshot.state.accounts[accountId].requests.request).not.toHaveProperty('authorization')
    expect(snapshot.state.signers.signer).not.toHaveProperty('futureCredential')
    expect(snapshot.state.windows).not.toHaveProperty('frames')
    expect(snapshot.state.windows).not.toHaveProperty('futureWindowState')
    expect(snapshot.state.windows.panel).not.toHaveProperty('futureWindowField')
    expect(snapshot.state.windows.panel.nav).toEqual([
      {
        view: 'requestView',
        data: { accountId, requestId: 'request' }
      }
    ])
    expect(snapshot.state.tray.homeCommand).toEqual({
      id: 1,
      view: 'addChain',
      data: {
        chain: {
          id: 1,
          name: 'Ethereum',
          symbol: 'ETH',
          primaryRpc: 'https://rpc.example'
        },
        requestId: 'request'
      }
    })
    expect(Object.keys(snapshot.state.selected).sort()).toEqual(['minimized', 'open'])
    expect(Object.keys(snapshot.state.view).sort()).toEqual([
      'badge',
      'notifications',
      'notify',
      'notifyData'
    ])
    expect(sender.once).toHaveBeenCalledWith('destroyed', expect.any(Function))
  })

  it('publishes a wallet asset-rates-only mutation as only the assetRates slice', () => {
    const { event, sender } = renderer()
    authorizeRenderer.mockReturnValue({ clientType: 'wallet-ui', webContentsId: sender.id })
    expect(connectState(event)).toEqual({ ok: true })

    store.getState().setAssetRates({
      token: { usdRate: 1, source: 'zerion', observedAt: 1 }
    })

    expect(sender.send).toHaveBeenCalledTimes(2)
    const update = sender.send.mock.calls[1][1]
    expect(update).toMatchObject({ baseRevision: 0, revision: 1 })
    expect(Object.keys(update.changes)).toEqual(['assetRates'])
    expect(update.changes.assetRates).toEqual({
      token: { usdRate: 1, source: 'zerion', observedAt: 1 }
    })
  })

  it('publishes active-profile Account deltas independently to wallet and side-tray streams', () => {
    const activeId = '0x1111111111111111111111111111111111111111'
    const workId = '0x2222222222222222222222222222222222222222'
    const state = store.getState()
    store.setState({
      main: {
        ...state.main,
        profiles: {
          [DEFAULT_PROFILE_ID]: { id: DEFAULT_PROFILE_ID, name: 'Profile 1' },
          work: { id: 'work', name: 'Work' }
        },
        profileOrder: [DEFAULT_PROFILE_ID, 'work'],
        currentProfile: DEFAULT_PROFILE_ID,
        currentAccount: activeId,
        accounts: {
          [activeId]: {
            id: activeId,
            profileId: DEFAULT_PROFILE_ID,
            address: activeId,
            name: 'Active',
            lastSignerType: 'address',
            status: 'ok',
            signer: '',
            requests: {},
            created: 'test:1'
          },
          [workId]: {
            id: workId,
            profileId: 'work',
            address: workId,
            name: 'Work',
            lastSignerType: 'address',
            status: 'ok',
            signer: '',
            requests: {},
            created: 'test:1'
          }
        },
        accountOrder: [activeId, workId]
      }
    })
    const wallet = renderer(1)
    const sideTray = renderer(2)
    authorizeRenderer.mockImplementation((event) => ({
      clientType: event.sender.id === 1 ? 'wallet-ui' : 'sidetray',
      webContentsId: event.sender.id
    }))
    expect(connectState(wallet.event)).toEqual({ ok: true })
    expect(connectState(sideTray.event)).toEqual({ ok: true })

    store.getState().selectProfile('work')

    const walletChanges = wallet.sender.send.mock.calls[1][1].changes
    const sideTrayChanges = sideTray.sender.send.mock.calls[1][1].changes
    expect(walletChanges).toMatchObject({
      accounts: { [workId]: expect.objectContaining({ id: workId, profileId: 'work' }) },
      accountOrder: [workId],
      currentAccount: workId,
      currentProfile: 'work'
    })
    expect(walletChanges.accounts).not.toHaveProperty(activeId)
    expect(sideTrayChanges).toMatchObject({
      accounts: { [workId]: expect.objectContaining({ id: workId }) },
      accountOrder: [workId],
      currentAccount: workId
    })
    expect(sideTrayChanges.accounts).not.toHaveProperty(activeId)
  })

  it('does not publish a batch when only excluded Electron secrets change', () => {
    const { event, sender } = renderer()
    authorizeRenderer.mockReturnValue({ clientType: 'wallet-ui', webContentsId: sender.id })
    expect(connectState(event)).toEqual({ ok: true })

    store.getState().updateLattice('device', { privKey: 'another-secret' })
    const state = store.getState()
    store.setState({
      main: { ...state.main, futureCredential: 'still-must-not-cross-ipc' }
    })

    expect(sender.send).toHaveBeenCalledTimes(1)
  })

  it('invalidates a stream when a changed projection cannot be validated', () => {
    const { event, sender } = renderer()
    authorizeRenderer.mockReturnValue({ clientType: 'wallet-ui', webContentsId: sender.id })
    expect(connectState(event)).toEqual({ ok: true })

    const state = store.getState()
    store.setState({ main: { ...state.main, launch: 'invalid' as unknown as boolean } })

    expect(sender.send).toHaveBeenCalledTimes(2)
    expect(sender.send.mock.calls[1][1]).toMatchObject({
      streamId: sender.send.mock.calls[0][1].streamId,
      type: 'stream-invalidated'
    })

    store.getState().setAssetRates({
      token: { usdRate: 2, source: 'zerion', observedAt: 2 }
    })
    expect(sender.send).toHaveBeenCalledTimes(2)
  })

  it('gives the bundled Send/Trade side tray a least-privilege projection', () => {
    const state = createInitialState()
    const id = '0x1111111111111111111111111111111111111111'
    const dormantId = '0x2222222222222222222222222222222222222222'
    state.main.profiles.dormant = { id: 'dormant', name: 'Dormant' }
    state.main.profileOrder.push('dormant')
    state.main.accounts[id] = {
      id,
      profileId: DEFAULT_PROFILE_ID,
      address: id,
      name: 'Side Tray Account',
      lastSignerType: 'address',
      status: 'ok',
      signer: 'secret-signer-id',
      requests: { secret: { type: 'sign', handlerId: 'secret' } },
      created: 'test:1',
      privateKey: 'must-not-cross-ipc'
    }
    state.main.accounts[dormantId] = {
      ...state.main.accounts[id],
      id: dormantId,
      profileId: 'dormant',
      address: dormantId,
      name: 'Dormant Account',
      privateKey: 'dormant-secret'
    }
    state.main.accountOrder = [dormantId, id]
    state.main.currentAccount = id
    state.main.balances[id] = []
    state.main.portfolioApiKey = 'secret-api-key'
    const chainImage = {
      base64: 'Y2hhaW4=',
      contentHash: 'chain-image',
      mimeType: 'image/png',
      sourceUrl: state.main.networksMeta.ethereum[1].icon
    }
    state.main.networksMeta.ethereum[1].image = chainImage
    const customToken = {
      address: '0x00000000000000000000000000000000000000aa',
      chainId: 1,
      decimals: 6,
      name: 'Custom Dollar',
      symbol: 'CUSD',
      custom: true,
      curated: false,
      sources: ['custom' as const],
      updatedAt: 0
    }
    const hiddenToken = {
      address: '0x00000000000000000000000000000000000000bb',
      chainId: 1,
      decimals: 18,
      name: 'Other Account Token',
      symbol: 'OAT',
      custom: false,
      curated: false,
      sources: ['onchain' as const],
      updatedAt: 0
    }
    state.main.tokens.byId = {
      [`1:${customToken.address}`]: customToken,
      [`1:${hiddenToken.address}`]: hiddenToken
    }
    state.main.tokens.accountTokenIds = {
      '0x2222222222222222222222222222222222222222': [`1:${hiddenToken.address}`]
    }
    store.setState({ ...state, ...actions() } as unknown as Parameters<typeof store.setState>[0], true)

    const { event, sender } = renderer(2)
    authorizeRenderer.mockReturnValue({ clientType: 'sidetray', webContentsId: sender.id })
    expect(connectState(event)).toEqual({ ok: true })

    const snapshot = sender.send.mock.calls[0][1]
    expect(Object.keys(snapshot.state).sort()).toEqual([
      'accountOrder',
      'accounts',
      'activity',
      'assetRates',
      'balances',
      'currentAccount',
      'networks',
      'networksMeta',
      'runtime',
      'tokens'
    ])
    expect(snapshot.state.accounts[id]).toEqual({
      id,
      address: id,
      name: 'Side Tray Account',
      lastSignerType: 'address'
    })
    expect(snapshot.state.accounts).not.toHaveProperty(dormantId)
    expect(snapshot.state.accountOrder).toEqual([id])
    expect(snapshot.state).not.toHaveProperty('permissions')
    expect(snapshot.state).not.toHaveProperty('portfolioApiKey')
    expect(snapshot.state).not.toHaveProperty('windows')
    expect(snapshot.state.accounts[id]).not.toHaveProperty('requests')
    expect(snapshot.state.accounts[id]).not.toHaveProperty('signer')
    expect(snapshot.state.accounts[id]).not.toHaveProperty('privateKey')
    expect(snapshot.state.tokens).toEqual({
      byId: { [`1:${customToken.address}`]: customToken },
      accountTokenIds: { [id]: [] }
    })
    expect(snapshot.state.networksMeta.ethereum[1].image).toEqual(chainImage)
    expect(snapshot.state.networksMeta.ethereum[1]).not.toHaveProperty('icon')

    store.getState().updateLattice('device', { privKey: 'another-secret' })
    expect(sender.send).toHaveBeenCalledTimes(1)

    store.getState().setAssetRates({
      token: { usdRate: 1, source: 'zerion', observedAt: 1 }
    })
    expect(sender.send).toHaveBeenCalledTimes(2)
    expect(sender.send.mock.calls[1][1]).toMatchObject({
      baseRevision: 0,
      revision: 1,
      changes: { assetRates: { token: { usdRate: 1, source: 'zerion', observedAt: 1 } } }
    })
  })

  it('rejects an unregistered or invalid sender without publishing state', () => {
    const { event, sender } = renderer()
    authorizeRenderer.mockReturnValue(undefined)

    expect(connectState(event)).toEqual({ ok: false, error: 'unauthorized' })
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('removes a stream as soon as its WebContents is destroyed', () => {
    const { event, sender } = renderer(3)
    authorizeRenderer.mockReturnValue({ clientType: 'wallet-ui', webContentsId: sender.id })
    expect(connectState(event)).toEqual({ ok: true })

    const destroyed = sender.once.mock.calls[0][1] as () => void
    destroyed()
    store.getState().setAssetRates({
      token: { usdRate: 2, source: 'zerion', observedAt: 2 }
    })

    expect(sender.send).toHaveBeenCalledTimes(1)
  })

  it('disposes IPC handlers, store subscriptions, and active connections together', () => {
    const { event, sender } = renderer(4)
    authorizeRenderer.mockReturnValue({ clientType: 'wallet-ui', webContentsId: sender.id })
    expect(connectState(event)).toEqual({ ok: true })

    stateStream.dispose()
    store.getState().setAssetRates({
      token: { usdRate: 3, source: 'zerion', observedAt: 3 }
    })

    expect(sender.send).toHaveBeenCalledTimes(1)
    expect(ipc.removeHandler).toHaveBeenCalledTimes(2)
  })
})
