import fs from 'fs'
import { ipcMain } from 'electron'
import log from 'electron-log'
import { randomBytes } from 'crypto'
import { isAddress } from 'ethers'
import { openFileDialog } from '../windows/dialog'
import { openBlockExplorer } from '../windows/window'

import accounts from '../accounts'
import signers from '../signers'
import vault from '../vault'
import biometrics from '../biometrics'
import * as launch from '../launch'
import provider from '../provider'
import store from '../store'
import nameResolution from '../nameResolution'

import { arraysEqual, randomLetters } from '../../resources/utils'
import { isSignatureRequest } from '../signatures'
import TrezorBridge from '../signers/trezor/bridge'

const callbackWhenDone = (fn: () => void, cb: (err: unknown) => void) => {
  try {
    fn()
    cb(null)
  } catch (e) {
    cb(e)
  }
}

const callbackWhenResolved = async <T>(fn: () => Promise<T> | T, cb: (err: unknown, value?: T) => void) => {
  try {
    cb(null, await fn())
  } catch (e) {
    cb(e)
  }
}

const signerSummaryCallback =
  (cb: (err: unknown, signer?: unknown) => void) => (err: unknown, signer: any) => {
    if (err) return cb(err)
    cb(err, signer && typeof signer.summary === 'function' ? signer.summary() : signer)
  }

const rpc: Record<string, (...args: any[]) => any> = {
  getState: (cb) => {
    cb(null, store())
  },
  getFrameId(window, cb) {
    if (window.frameId) {
      cb(null, window.frameId)
    } else {
      cb(new Error('No frameId set for this window'))
    }
  },
  signTransaction: accounts.signTransaction,
  signMessage: accounts.signMessage,
  getAccounts: accounts.getAccounts,
  getCoinbase: accounts.getCoinbase,
  // Review
  // getSigners: signers.getSigners,
  setSigner: (id, cb) => {
    const previousAddresses = accounts.getSelectedAddresses()

    accounts.setSigner(id, cb)

    const currentAddresses = accounts.getSelectedAddresses()

    if (!arraysEqual(previousAddresses, currentAddresses)) {
      provider.accountsChanged(currentAddresses)
    }
  },
  // setSignerIndex: (index, cb) => {
  //   accounts.setSignerIndex(index, cb)
  //   provider.accountsChanged(accounts.getSelectedAddresses())
  //   setTimeout(() => {
  //     accounts.balanceScan()
  //   }, 320)
  // },
  unsetSigner: (id, cb) => {
    const previousAddresses = accounts.getSelectedAddresses()

    accounts.unsetSigner(cb)

    const currentAddresses = accounts.getSelectedAddresses()

    if (!arraysEqual(previousAddresses, currentAddresses)) {
      provider.accountsChanged(currentAddresses)
    }
  },
  // setSignerIndex: signers.setSignerIndex,
  // unsetSigner: signers.unsetSigner,
  trezorPin: (id, pin, cb) => {
    cb()
    TrezorBridge.pinEntered(id, pin)
  },
  trezorPhrase: (id, phrase, cb) => {
    cb()
    TrezorBridge.passphraseEntered(id, phrase)
  },
  trezorEnterPhrase: (id, cb) => {
    cb()
    TrezorBridge.enterPassphraseOnDevice(id)
  },
  createLattice: (deviceId, deviceName, cb) => {
    if (!deviceId) {
      return cb(new Error('No Device ID'))
    }

    store.updateLattice(deviceId, {
      deviceId,
      baseUrl: 'https://signing.gridpl.us',
      endpointMode: 'default',
      paired: true,
      deviceName: (deviceName || 'GridPlus').substring(0, 14),
      tag: randomLetters(6),
      privKey: randomBytes(32).toString('hex')
    })

    cb(null, { id: 'lattice-' + deviceId })
  },
  async latticePair(id, pin, cb) {
    const signer = signers.get(id) as any

    if (signer && signer.pair) {
      try {
        const hasActiveWallet = await signer.pair(pin)
        cb(null, hasActiveWallet)
      } catch (e) {
        cb((e as Error).message)
      }
    }
  },
  launchStatus: launch.status,
  providerSend: (payload, cb) => provider.send(payload, cb),
  connectionStatus: (cb) => {
    const connection = provider.connection as any
    cb(null, {
      primary: {
        status: connection.primary.status,
        network: connection.primary.network,
        type: connection.primary.type,
        connected: connection.primary.connected
      },
      secondary: {
        status: connection.secondary.status,
        network: connection.secondary.network,
        type: connection.secondary.type,
        connected: connection.secondary.connected
      }
    })
  },
  confirmRequestApproval(req, approvalType, approvalData) {
    accounts.confirmRequestApproval(req.handlerId, approvalType, approvalData)
  },
  respondToExtensionRequest(id, approved, cb) {
    callbackWhenDone(() => store.trustExtension(id, approved), cb)
  },
  updateRequest(reqId, data, actionId) {
    accounts.updateRequest(reqId, data, actionId)
  },
  approveRequest(req) {
    accounts.setRequestPending(req)
    if (req.type === 'transaction') {
      provider.approveTransactionRequest(req, (err, res) => {
        if (err) return accounts.setRequestError(req.handlerId, err)
        accounts.setTxSent(req.handlerId, res as string)
      })
    } else if (req.type === 'sign') {
      provider.approveSign(req, (err, res) => {
        if (err) {
          return accounts.setRequestError(req.handlerId, err)
        }
        // setRequestSuccess ignores arguments beyond handlerId
        ;(accounts.setRequestSuccess as any)(req.handlerId, res)
      })
    } else if (req.type === 'signTypedData' || req.type === 'signErc20Permit') {
      provider.approveSignTypedData(req, (err, res) => {
        if (err) {
          return accounts.setRequestError(req.handlerId, err)
        }
        // setRequestSuccess ignores arguments beyond handlerId
        ;(accounts.setRequestSuccess as any)(req.handlerId, res)
      })
    }
  },
  declineRequest(req) {
    if (req.type === 'transaction' || isSignatureRequest(req)) {
      accounts.declineRequest(req.handlerId)
      provider.declineRequest(req)
    }
  },
  createFromAddress(address, name, cb) {
    if (!isAddress(address)) return cb(new Error('Invalid Address'))
    accounts.add(address, name, { type: 'Address' })
    cb()
  },
  createAccount(address, name, options, cb) {
    if (!isAddress(address)) return cb(new Error('Invalid Address'))
    accounts.add(address, name, options)
    cb()
  },
  removeAccount(address, _options, cb) {
    accounts.remove(address)
    cb()
  },
  createFromPhrase(phrase, password, cb) {
    signers.createFromPhrase(phrase, password, signerSummaryCallback(cb))
  },
  generatePhrase(cb) {
    signers.newPhrase(cb)
  },
  async locateKeystore(cb) {
    try {
      const file = await openFileDialog()
      const keystore = file || { filePaths: [] }
      if ((keystore.filePaths || []).length > 0) {
        fs.readFile(keystore.filePaths[0], 'utf8', (err, data) => {
          if (err) return cb(err)
          try {
            const parsed = JSON.parse(data)
            if (typeof parsed.version !== 'number') cb('Invalid keystore file')
            if (![1, 3].includes(parsed.version)) cb('Invalid keystore version')
            cb(null, parsed)
          } catch (err) {
            cb(err)
          }
        })
      } else {
        cb(new Error('No Keystore Found'))
      }
    } catch (e) {
      cb(e)
    }
  },
  createFromKeystore(keystore, password, keystorePassword, cb) {
    signers.createFromKeystore(keystore, keystorePassword, password, signerSummaryCallback(cb))
  },
  createFromPrivateKey(privateKey, password, cb) {
    signers.createFromPrivateKey(privateKey, password, signerSummaryCallback(cb))
  },
  addPrivateKey(id, privateKey, password, cb) {
    signers.addPrivateKey(id, privateKey, password, cb)
  },
  removePrivateKey(id, index, password, cb) {
    signers.removePrivateKey(id, index, password, cb)
  },
  addKeystore(id, keystore, keystorePassword, password, cb) {
    signers.addKeystore(id, keystore, keystorePassword, password, cb)
  },
  unlockSigner(id, password, cb) {
    signers.unlock(id, password, cb)
  },
  lockSigner(id, cb) {
    signers.lock(id, cb)
  },
  vaultState(cb) {
    cb(null, vault.summary())
  },
  biometricsState(cb) {
    cb(null, biometrics.summary())
  },
  enableBiometrics(payload, cb) {
    callbackWhenResolved(async () => {
      if (!vault.isUnlocked()) throw new Error('Unlock Newframe before enabling biometric login')

      if (payload?.method === 'webauthn') {
        biometrics.enableWebAuthn(vault.getKey() as string, payload.credential, payload.secret)
      } else if (payload?.method === 'native') {
        await biometrics.enableNative(vault.getKey() as string)
      } else {
        throw new Error('Unsupported biometric enrollment method')
      }

      store.setBiometricUnlock(true)
      return biometrics.summary()
    }, cb)
  },
  disableBiometrics(cb) {
    callbackWhenResolved(() => {
      biometrics.disable()
      store.setBiometricUnlock(false)
      return biometrics.summary()
    }, cb)
  },
  unlockVault(password, cb) {
    signers.unlockVault(password, cb)
  },
  unlockVaultWithBiometrics(payload, cb) {
    signers.unlockVaultWithBiometrics(payload, cb)
  },
  lockVault(cb) {
    signers.lockVault(cb)
  },
  exportAccountPrivateKey(address, password, cb) {
    signers.exportAccountPrivateKey(address, password, cb)
  },
  changeVaultPassword(oldPassword, newPassword, cb) {
    callbackWhenDone(() => vault.changePassword(oldPassword, newPassword), cb)
  },
  remove(id) {
    signers.remove(id)
  },
  async resolveName(name, cb) {
    log.debug('Resolving name', { name })

    try {
      const ethAddress = await nameResolution.resolveAddress(name)
      cb(null, ethAddress)
    } catch (err) {
      log.warn(`Could not resolve name ${name}:`, err)
      return cb(err)
    }
  },
  verifyAddress(cb) {
    const res = (err: any, data: any) => cb(err, data || false)
    accounts.verifyAddress(true, res)
  },
  setBaseFee(fee, handlerId, cb) {
    callbackWhenDone(() => accounts.setBaseFee(fee, handlerId, true), cb)
  },
  setPriorityFee(fee, handlerId, cb) {
    callbackWhenDone(() => accounts.setPriorityFee(fee, handlerId, true), cb)
  },
  setGasPrice(price, handlerId, cb) {
    callbackWhenDone(() => accounts.setGasPrice(price, handlerId, true), cb)
  },
  setGasLimit(limit, handlerId, cb) {
    callbackWhenDone(() => accounts.setGasLimit(limit, handlerId, true), cb)
  },
  removeFeeUpdateNotice(handlerId, cb) {
    accounts.removeFeeUpdateNotice(handlerId, cb)
  },
  signerCompatibility(handlerId, cb) {
    accounts.signerCompatibility(handlerId, cb)
  },
  openExplorer(chain) {
    if (store('main.mute.explorerWarning')) {
      openBlockExplorer(chain)
    } else {
      store.notify('openExplorer', { chain })
    }
  }
}

const unwrap = (v: any) => (v !== undefined && v !== null ? JSON.parse(v) : v)
const wrap = (v: any) => (v !== undefined && v !== null ? JSON.stringify(v) : v)

ipcMain.on('main:rpc', (event, id, method, ...args) => {
  id = unwrap(id)
  method = unwrap(method)
  args = args.map((arg) => unwrap(arg))
  if (rpc[method]) {
    if (method === 'getFrameId') {
      rpc[method]((event.sender as any).getOwnerBrowserWindow(), ...args, (...args: any[]) => {
        event.sender.send(
          'main:rpc',
          id,
          ...args.map((arg) => (arg instanceof Error ? wrap(arg.message) : wrap(arg)))
        )
      })
    } else {
      rpc[method](...args, (...args: any[]) => {
        event.sender.send(
          'main:rpc',
          id,
          ...args.map((arg) => (arg instanceof Error ? wrap(arg.message) : wrap(arg)))
        )
      })
    }
  } else {
    const args = [new Error('Unknown RPC method: ' + method)]
    event.sender.send(
      'main:rpc',
      id,
      ...args.map((arg) => (arg instanceof Error ? wrap(arg.message) : wrap(arg)))
    )
  }
})
