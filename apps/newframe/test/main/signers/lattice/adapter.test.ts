import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'

import log from 'electron-log'
import { EventEmitter } from 'events'

import LatticeSignerAdapter from '../../../../main/signers/lattice/adapter'
import Lattice from '../../../../main/signers/lattice/Lattice'

import store from '../../../../main/store'

mock.module('../../../../main/signers/lattice/Lattice', () => ({ __esModule: true, default: mock() }))

let adapter: any

beforeAll(() => {
  log.transports.console.level = false
})

afterAll(() => {
  log.transports.console.level = 'debug'
})

beforeEach(() => {
  store.setState((state) => {
    const main = state.main as any
    main.lattice = {
      NBaJ8e: {
        deviceName: 'Newframe-testlattice',
        privKey: 'supersecretkey',
        paired: true
      }
    }
    main.latticeSettings = {
      accountLimit: 5,
      derivation: 'legacy',
      endpointMode: 'default',
      endpointCustom: ''
    }
  })

  adapter = new LatticeSignerAdapter()
})

afterEach(() => {
  adapter.close()
})

it('has the correct adapter type', () => {
  const adapter = new LatticeSignerAdapter()
  expect(adapter.adapterType).toBe('lattice')
})

describe('#open', () => {
  beforeEach(() => {
    store.setState((state) => {
      state.main.lattice = {}
    })
  })

  it('subscribes to settings', () => {
    adapter.open()

    expect(adapter.unsubscribeSettings).toBeInstanceOf(Function)
  })

  it('subscribes to signers', () => {
    adapter.open()

    expect(adapter.unsubscribeSigners).toBeInstanceOf(Function)
  })
})

describe('#close', () => {
  beforeEach(() => {
    store.setState((state) => {
      state.main.lattice = {}
    })
    adapter.open()
  })

  it('unsubscribes from settings', () => {
    adapter.close()

    expect(adapter.unsubscribeSettings).toBe(undefined)
  })

  it('unsubscribes from signers', () => {
    adapter.close()

    expect(adapter.unsubscribeSigners).toBe(undefined)
  })
})

describe('#remove', () => {
  const latticeSigner = { deviceId: 'M8jl93' }

  beforeEach(() => {
    ;(latticeSigner as any).close = mock()
  })

  it('removes a Lattice device from the store', () => {
    adapter.remove(latticeSigner)

    expect(store.getState().removeLattice).toHaveBeenCalledWith('M8jl93')
  })

  it('closes a known Lattice signer', () => {
    adapter.knownSigners['M8jl93'] = { deviceName: 'existing-frame-lattice' }

    adapter.remove(latticeSigner)

    expect((latticeSigner as any).close).toHaveBeenCalled()
  })

  it('does not attempt to close an unknown Lattice signer', () => {
    adapter.knownSigners['G6s8sa'] = { deviceName: 'existing-frame-lattice' }
    adapter.remove(latticeSigner)

    expect((latticeSigner as any).close).not.toHaveBeenCalled()
  })
})

describe('#reload', () => {
  const latticeSigner = { deviceId: 'NBaJ8e' }

  beforeEach(() => {
    ;(latticeSigner as any).connect = mock()
    ;(latticeSigner as any).disconnect = mock()
  })

  it('disconnects the Lattice signer', () => {
    adapter.reload(latticeSigner)

    expect((latticeSigner as any).disconnect).toHaveBeenCalled()
  })

  it('connects the Lattice signer with the correct settings', () => {
    adapter.reload(latticeSigner)

    expect((latticeSigner as any).connect).toHaveBeenCalledWith('https://signing.gridpl.us', 'supersecretkey')
  })
})

describe('settings changes', () => {
  const latticeSigner = {
    deviceId: 'NBaJ8e'
  }

  beforeEach(() => {
    ;(latticeSigner as any).connect = mock()
    ;(latticeSigner as any).disconnect = mock()
    ;(latticeSigner as any).deriveAddresses = mock()
    ;(latticeSigner as any).update = mock()
    ;(latticeSigner as any).addresses = Array(5).fill('addr')
    ;(latticeSigner as any).connection = {
      baseUrl: 'https://signing.gridpl.us'
    }

    adapter.knownSigners['NBaJ8e'] = latticeSigner
    adapter.open()
    ;(latticeSigner as any).connect.mockClear()
    ;(latticeSigner as any).disconnect.mockClear()
    ;(latticeSigner as any).deriveAddresses.mockClear()
  })

  it('does not attempt to reload a Lattice with no connection', () => {
    delete (latticeSigner as any).connection

    store.setState((state) => {
      state.main.latticeSettings.endpointMode = 'custom'
      state.main.latticeSettings.endpointCustom = 'https://myendpoint.io'
    })

    expect((latticeSigner as any).disconnect).not.toHaveBeenCalled()
    expect((latticeSigner as any).connect).not.toHaveBeenCalled()
  })

  it('does not attempt to reload a Lattice if the relay URL has not changed', () => {
    store.setState((state) => {
      state.main.latticeSettings.endpointMode = 'custom'
      state.main.latticeSettings.endpointCustom = 'https://signing.gridpl.us'
    })

    expect((latticeSigner as any).disconnect).not.toHaveBeenCalled()
    expect((latticeSigner as any).connect).not.toHaveBeenCalled()
  })

  it('reloads a connected Lattice if the relay URL is changed to custom', () => {
    store.setState((state) => {
      state.main.latticeSettings.endpointMode = 'custom'
      state.main.latticeSettings.endpointCustom = 'https://myendpoint.io'
    })

    expect((latticeSigner as any).disconnect).toHaveBeenCalled()
    expect((latticeSigner as any).connect).toHaveBeenCalledWith('https://myendpoint.io', 'supersecretkey')
  })

  it('reloads a connected Lattice if the relay URL is changed back to the default', () => {
    ;(latticeSigner as any).connection = {
      baseUrl: 'https://customendpoint.io'
    }

    store.setState((state) => {
      state.main.latticeSettings.endpointMode = 'standard'
      state.main.latticeSettings.endpointCustom = 'https://customendpoint.io'
    })

    expect((latticeSigner as any).disconnect).toHaveBeenCalled()
    expect((latticeSigner as any).connect).toHaveBeenCalledWith('https://signing.gridpl.us', 'supersecretkey')
  })

  it('derives addresses if the account limit has increased above the number of addresses', () => {
    ;(latticeSigner as any).accountLimit = 5

    store.setState((state) => {
      state.main.latticeSettings.accountLimit = 10
    })

    expect((latticeSigner as any).deriveAddresses).toHaveBeenCalled()
  })

  it('updates if the number of displayed addresses has changed but none need to be derived', () => {
    ;(latticeSigner as any).accountLimit = 10

    const updateHandler = mock()
    adapter.once('update', updateHandler)

    store.setState((state) => {
      state.main.latticeSettings.accountLimit = 4
    })

    expect((latticeSigner as any).deriveAddresses).not.toHaveBeenCalled()
    expect(updateHandler).toHaveBeenCalled()
  })

  it('derives addresses if the derivation changed', () => {
    store.setState((state) => {
      state.main.latticeSettings.derivation = 'standard'
    })

    expect((latticeSigner as any).deriveAddresses).toHaveBeenCalled()
  })
})

describe('signer device changes', () => {
  let latticeSigner: any

  const addLattice = (paired = true) => {
    store.setState((state) => {
      ;(state.main.lattice as any).NBaJ8e = {
        deviceName: 'Newframe-testlattice',
        privKey: 'supersecretkey',
        paired
      }
    })
  }

  beforeEach(() => {
    store.setState((state) => {
      state.main.lattice = {}
    })

    latticeSigner = new EventEmitter()
    latticeSigner.connect = mock(() => Promise.resolve())
    latticeSigner.disconnect = mock()
    latticeSigner.deriveAddresses = mock()
    ;(Lattice as any).mockImplementation((deviceId: any, deviceName: any) => {
      latticeSigner.deviceId = deviceId
      latticeSigner.deviceName = deviceName
      latticeSigner.id = 'lattice-' + deviceId
      return latticeSigner
    })

    adapter.open()
  })

  describe('detecting a new Lattice', () => {
    it('creates a new signer', (done) => {
      adapter.once('add', (lattice: any) => {
        try {
          expect(Object.keys(adapter.knownSigners)).toHaveLength(1)
          expect(adapter.knownSigners['NBaJ8e']).toBeTruthy()
          expect(lattice.deviceId).toBe('NBaJ8e')
          expect(lattice.deviceName).toBe('Newframe-testlattice')
          done()
        } catch (e) {
          done(e)
        }
      })

      addLattice()
    })

    it('does not create a new signer from one that is already known', () => {
      adapter.knownSigners['NBaJ8e'] = { deviceName: 'existing-frame-lattice' }
      ;(Lattice as any).mockImplementation(() => {
        throw new Error('attempted to create duplicate signer!')
      })

      addLattice()

      expect(Object.keys(adapter.knownSigners)).toHaveLength(1)
    })

    it('connects to a paired signer', () => {
      latticeSigner.connect.mockImplementation((baseUrl: any, privKey: any) => {
        expect(baseUrl).toBe('https://signing.gridpl.us')
        expect(privKey).toBe('supersecretkey')
        return Promise.resolve()
      })

      addLattice(true)

      expect(adapter.knownSigners['NBaJ8e']).toBeTruthy()
    })

    it('does not attempt to connect to an unpaired signer', () => {
      latticeSigner.connect.mockImplementation(() => {
        throw new Error('should not attempt to connect!')
      })

      addLattice(false)

      expect(adapter.knownSigners['NBaJ8e']).toBeTruthy()
    })

    it('sets the device to unpaired if connecting fails', (done) => {
      latticeSigner.connect.mockImplementation(() => Promise.reject())
      ;(store.getState().updateLattice as any).mockImplementation((deviceId: string, { paired }: any) => {
        try {
          expect(deviceId).toBe('NBaJ8e')
          expect(paired).toBe(false)
          done()
        } catch (e) {
          done(e)
        }
      })

      addLattice()
    })
  })

  describe('signer events', () => {
    beforeEach(() => {
      // creates a new Lattice signer
      addLattice()
    })

    it('handles update events', () => {
      const updateHandler = mock()
      adapter.once('update', updateHandler)

      latticeSigner.emit('update')

      expect(updateHandler).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: 'NBaJ8e', deviceName: 'Newframe-testlattice' })
      )
    })

    it('derives addresses if the signer is paired', () => {
      latticeSigner.emit('connect', true)

      expect(latticeSigner.deriveAddresses).toHaveBeenCalled()
    })

    it('updates the Lattice to paired if signer is paired after connecting', () => {
      latticeSigner.emit('connect', true)

      expect(store.getState().updateLattice).toHaveBeenCalledWith(
        'NBaJ8e',
        expect.objectContaining({ paired: true })
      )
    })

    it('updates the Lattice to unpaired if signer is not paired after connecting', () => {
      latticeSigner.deriveAddresses.mockImplementation(() => {
        throw new Error('tried to derive addresses for un-paired Lattice!')
      })

      latticeSigner.emit('connect', false)

      expect(store.getState().updateLattice).toHaveBeenCalledWith(
        'NBaJ8e',
        expect.objectContaining({ paired: false })
      )
    })

    it('derives addresses if the signer has an active wallet after pairing', () => {
      latticeSigner.emit('paired', true)

      expect(latticeSigner.deriveAddresses).toHaveBeenCalled()
    })

    it('updates the paired state of the Lattice after pairing', () => {
      latticeSigner.emit('paired', false)

      // paired is always true even if there is no active wallet
      expect(store.getState().updateLattice).toHaveBeenCalledWith(
        'NBaJ8e',
        expect.objectContaining({ paired: true })
      )
    })

    it('updates the Lattice to unpaired after an error connecting', () => {
      latticeSigner.connection = { isPaired: false }

      latticeSigner.emit('error')

      expect(store.getState().updateLattice).toHaveBeenCalledWith(
        'NBaJ8e',
        expect.objectContaining({ paired: false })
      )
    })

    it('disconnects after an error', () => {
      latticeSigner.emit('error')

      expect(latticeSigner.disconnect).toHaveBeenCalled()
    })

    it('emits an update after an error', () => {
      const updateHandler = mock()
      adapter.once('update', updateHandler)

      latticeSigner.emit('error')

      expect(updateHandler).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: 'NBaJ8e', deviceName: 'Newframe-testlattice' })
      )
    })

    it('removes a known signer on close', () => {
      latticeSigner.emit('close')

      expect(adapter.knownSigners).toEqual({})
    })

    it('emits a remove event on close', () => {
      const updateHandler = mock()
      adapter.once('remove', updateHandler)

      latticeSigner.emit('close')

      expect(updateHandler).toHaveBeenCalledWith('lattice-NBaJ8e')
    })
  })
})
