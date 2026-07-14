import { beforeAll, beforeEach, describe, expect, it, jest, mock } from 'bun:test'

import createInitialState from '../../../main/store/state'
import { StateMessageChannel } from '../../../resources/state/protocol'
import { storeMock } from '../../bun.mocks'

const authorizeRenderer = jest.fn()

mock.module('../../../main/ipc/authorization', () => ({ authorizeRenderer }))

let connectState: typeof import('../../../main/ipc/stateStream').connectState
let registerStateStreamHandlers: typeof import('../../../main/ipc/stateStream').registerStateStreamHandlers
let resetStateStreamsForTests: typeof import('../../../main/ipc/stateStream').resetStateStreamsForTests

const actions = () =>
  Object.fromEntries(Object.entries(storeMock.getState()).filter(([, value]) => typeof value === 'function'))

function resetCanonicalState() {
  storeMock.setState({ ...createInitialState(), ...actions() }, true)
}

function renderer(id = 1) {
  const sender = {
    id,
    isDestroyed: jest.fn(() => false),
    once: jest.fn(),
    send: jest.fn()
  }

  return { event: { sender } as unknown as Electron.IpcMainInvokeEvent, sender }
}

beforeAll(async () => {
  const stateStream = await import('../../../main/ipc/stateStream')
  connectState = stateStream.connectState
  registerStateStreamHandlers = stateStream.registerStateStreamHandlers
  resetStateStreamsForTests = stateStream.resetStateStreamsForTests
  registerStateStreamHandlers()
})

beforeEach(() => {
  authorizeRenderer.mockReset()
  resetStateStreamsForTests()
  resetCanonicalState()
})

describe('renderer state stream', () => {
  it('sends a strict flat wallet snapshot and excludes Electron-only and nested UI fields', () => {
    const { event, sender } = renderer()
    storeMock.getState().updateLattice('device', { privKey: 'secret' })
    const state = storeMock.getState()
    const accountId = '0x1111111111111111111111111111111111111111'
    storeMock.setState({
      main: {
        ...state.main,
        futureCredential: 'must-not-cross-ipc',
        accounts: {
          ...state.main.accounts,
          [accountId]: {
            id: accountId,
            address: accountId,
            name: 'Wallet Account',
            lastSignerType: 'address',
            status: 'ok',
            signer: '',
            requests: {},
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
              view: 'home',
              data: { accountId: 'one', futureNavigationField: 'must-not-cross-ipc' }
            }
          ]
        }
      },
      selected: { ...state.selected, futureSelection: 'must-not-cross-ipc' },
      view: { ...state.view, futureViewState: 'must-not-cross-ipc' }
    })
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
    expect(snapshot.state.accounts[accountId]).not.toHaveProperty('futureCredential')
    expect(snapshot.state.signers.signer).not.toHaveProperty('futureCredential')
    expect(snapshot.state.windows).not.toHaveProperty('frames')
    expect(snapshot.state.windows).not.toHaveProperty('futureWindowState')
    expect(snapshot.state.windows.panel).not.toHaveProperty('futureWindowField')
    expect(snapshot.state.windows.panel.nav[0].data).not.toHaveProperty('futureNavigationField')
    expect(Object.keys(snapshot.state.selected).sort()).toEqual(['minimized', 'open'])
    expect(Object.keys(snapshot.state.view).sort()).toEqual([
      'badge',
      'notifications',
      'notify',
      'notifyData'
    ])
    expect(sender.once).toHaveBeenCalledWith('destroyed', expect.any(Function))
  })

  it('publishes a wallet rates-only mutation as only the rates slice', () => {
    const { event, sender } = renderer()
    authorizeRenderer.mockReturnValue({ clientType: 'wallet-ui', webContentsId: sender.id })
    expect(connectState(event)).toEqual({ ok: true })

    storeMock.getState().setRates({ token: { usd: { price: 1, change24hr: 0 } } })

    expect(sender.send).toHaveBeenCalledTimes(2)
    const update = sender.send.mock.calls[1][1]
    expect(update).toMatchObject({ baseRevision: 0, revision: 1 })
    expect(Object.keys(update.changes)).toEqual(['rates'])
    expect(update.changes.rates).toEqual({
      token: { usd: { price: 1, change24hr: 0 } }
    })
  })

  it('does not publish a batch when only excluded Electron secrets change', () => {
    const { event, sender } = renderer()
    authorizeRenderer.mockReturnValue({ clientType: 'wallet-ui', webContentsId: sender.id })
    expect(connectState(event)).toEqual({ ok: true })

    storeMock.getState().updateLattice('device', { privKey: 'another-secret' })
    const state = storeMock.getState()
    storeMock.setState({
      main: { ...state.main, futureCredential: 'still-must-not-cross-ipc' }
    })

    expect(sender.send).toHaveBeenCalledTimes(1)
  })

  it('invalidates a stream when a changed projection cannot be validated', () => {
    const { event, sender } = renderer()
    authorizeRenderer.mockReturnValue({ clientType: 'wallet-ui', webContentsId: sender.id })
    expect(connectState(event)).toEqual({ ok: true })

    const state = storeMock.getState()
    storeMock.setState({ main: { ...state.main, launch: 'invalid' as unknown as boolean } })

    expect(sender.send).toHaveBeenCalledTimes(2)
    expect(sender.send.mock.calls[1][1]).toMatchObject({
      streamId: sender.send.mock.calls[0][1].streamId,
      type: 'stream-invalidated'
    })

    storeMock.getState().setRates({ token: { usd: { price: 2, change24hr: 0 } } })
    expect(sender.send).toHaveBeenCalledTimes(2)
  })

  it('gives the bundled Send/Trade dapp renderer a least-privilege projection', () => {
    const state = createInitialState()
    const id = '0x1111111111111111111111111111111111111111'
    state.main.accounts[id] = {
      id,
      address: id,
      name: 'Dapp Account',
      lastSignerType: 'address',
      status: 'ok',
      signer: 'secret-signer-id',
      requests: { secret: { type: 'sign', handlerId: 'secret' } },
      created: 'test:1',
      privateKey: 'must-not-cross-ipc'
    }
    state.main.accountOrder = [id]
    state.main.currentAccount = id
    state.main.balances[id] = []
    state.main.portfolioApiKey = 'secret-api-key'
    storeMock.setState({ ...state, ...actions() }, true)

    const { event, sender } = renderer(2)
    authorizeRenderer.mockReturnValue({ clientType: 'dapp', webContentsId: sender.id })
    expect(connectState(event)).toEqual({ ok: true })

    const snapshot = sender.send.mock.calls[0][1]
    expect(Object.keys(snapshot.state).sort()).toEqual([
      'accountOrder',
      'accounts',
      'balances',
      'currentAccount',
      'networks',
      'networksMeta',
      'rates',
      'runtime'
    ])
    expect(snapshot.state.accounts[id]).toEqual({
      id,
      address: id,
      name: 'Dapp Account',
      lastSignerType: 'address'
    })
    expect(snapshot.state).not.toHaveProperty('permissions')
    expect(snapshot.state).not.toHaveProperty('portfolioApiKey')
    expect(snapshot.state).not.toHaveProperty('windows')
    expect(snapshot.state.accounts[id]).not.toHaveProperty('requests')
    expect(snapshot.state.accounts[id]).not.toHaveProperty('signer')
    expect(snapshot.state.accounts[id]).not.toHaveProperty('privateKey')

    storeMock.getState().updateLattice('device', { privKey: 'another-secret' })
    expect(sender.send).toHaveBeenCalledTimes(1)

    storeMock.getState().setRates({ token: { usd: { price: 1, change24hr: 0 } } })
    expect(sender.send).toHaveBeenCalledTimes(2)
    expect(sender.send.mock.calls[1][1]).toMatchObject({
      baseRevision: 0,
      revision: 1,
      changes: { rates: { token: { usd: { price: 1, change24hr: 0 } } } }
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
    storeMock.getState().setRates({ token: { usd: { price: 2, change24hr: 0 } } })

    expect(sender.send).toHaveBeenCalledTimes(1)
  })
})
