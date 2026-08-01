import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import type { SignerImportCommand, TrezorInputCommand } from '../../../contracts/operations.js'
import { randomLetters } from '../../../domain/text.js'
import type Signer from '../../signers/Signer/index.js'
import type { AccountOnboardingPorts, OnboardingSigner } from '../../features/accountOnboarding/service.js'
import { openFileDialog } from '../../windows/dialog.js'
import { createOneResultCallbackBoundary, type OneResultCallback } from '../callbacks/oneResult.js'

export interface ProductionAccountOnboardingExternal {
  signers: {
    createFromPhrase(phrase: string, password: string, callback: OneResultCallback<Signer>): void
    createFromPrivateKey(privateKey: string, password: string, callback: OneResultCallback<Signer>): void
    createFromKeystore(
      keystore: string | { version: number },
      keystorePassword: string,
      password: string,
      callback: OneResultCallback<Signer>
    ): void
    exportAccountPrivateKey(
      address: string,
      password: string,
      callback: OneResultCallback<{ type: string; value: string }>
    ): void
    get(id: string): Signer | undefined
    newPhrase(callback: OneResultCallback<string>): void
    reload(id: string): void
    remove(id: string): void
  }
  store: {
    getState(): {
      updateLattice(deviceId: string, update: Record<string, unknown>): void
    }
  }
  trezorBridge: {
    pinEntered(signerId: string, value: string): void
    passphraseEntered(signerId: string, value: string): void
    enterPassphraseOnDevice(signerId: string): void
  }
}

export function createProductionAccountOnboardingAdapters(
  external: ProductionAccountOnboardingExternal
): Pick<AccountOnboardingPorts, 'hardware' | 'keystore' | 'secrets' | 'signers'> & {
  dispose(): void
} {
  const callbacks = createOneResultCallbackBoundary()
  return {
    dispose: callbacks.dispose,
    hardware: {
      configureLattice(deviceId, deviceName) {
        external.store.getState().updateLattice(deviceId, {
          deviceId,
          baseUrl: 'https://signing.gridpl.us',
          endpointMode: 'default',
          paired: true,
          deviceName: (deviceName || 'GridPlus').substring(0, 14),
          tag: randomLetters(6),
          privKey: randomBytes(32).toString('hex')
        })
        return `lattice-${deviceId}`
      },
      loadLedgerAccounts(signerId, accountCount) {
        const signer = external.signers.get(signerId) as
          | (Signer & { accountLimit: number; derivation?: string; deriveAddresses(): void })
          | undefined
        if (!signer || signer.type !== 'ledger') return false
        if (signer.derivation !== 'live' || accountCount <= signer.accountLimit) return true
        signer.accountLimit = accountCount
        signer.deriveAddresses()
        return true
      },
      async pairLattice(signerId, pairCode) {
        const signer = external.signers.get(signerId) as
          | (Signer & { pair?: (value: string) => Promise<void> })
          | undefined
        if (!signer || signer.type !== 'lattice' || typeof signer.pair !== 'function') return false
        await signer.pair(pairCode)
        return true
      },
      submitTrezorInput(command: TrezorInputCommand) {
        const signer = external.signers.get(command.signerId)
        if (!signer || signer.type !== 'trezor') return false
        if (command.input === 'pin') external.trezorBridge.pinEntered(command.signerId, command.value)
        if (command.input === 'passphrase') {
          external.trezorBridge.passphraseEntered(command.signerId, command.value)
        }
        if (command.input === 'device-passphrase') {
          external.trezorBridge.enterPassphraseOnDevice(command.signerId)
        }
        return true
      }
    },
    keystore: {
      async locate() {
        const selection = await openFileDialog()
        const filePath = selection?.filePaths?.[0]
        if (!filePath) return
        const parsed = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>
        if (![1, 3].includes(Number(parsed.version))) throw new Error('Invalid keystore version')
        return parsed
      }
    },
    signers: {
      create(command: SignerImportCommand): Promise<OnboardingSigner> {
        return callbacks.run((done) => {
          if (command.source === 'phrase') {
            external.signers.createFromPhrase(command.phrase, command.framePassword, done)
          } else if (command.source === 'private-key') {
            external.signers.createFromPrivateKey(command.privateKey, command.framePassword, done)
          } else {
            external.signers.createFromKeystore(
              command.keystore,
              command.keystorePassword,
              command.framePassword,
              done
            )
          }
        })
      },
      get: (signerId) => external.signers.get(signerId),
      reload(signerId) {
        if (!external.signers.get(signerId)) return false
        external.signers.reload(signerId)
        return true
      },
      remove(signerId) {
        if (!external.signers.get(signerId)) return false
        external.signers.remove(signerId)
        return true
      }
    },
    secrets: {
      exportPrivateKey: (address, password) =>
        callbacks.run((done) => external.signers.exportAccountPrivateKey(address, password, done)),
      generateSeedPhrase: () => callbacks.run((done) => external.signers.newPhrase(done))
    }
  }
}
