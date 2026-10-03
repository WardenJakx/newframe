import fsp from 'node:fs/promises'
import path from 'node:path'

import { encrypt } from '@metamask/browser-passworder'
import { UR, UREncoder } from '@ngraveio/bc-ur'
import { HDNodeWallet, Wallet } from 'ethers'
import { gzipSync, strToU8 } from 'fflate'
import QRCode from 'qrcode'

import { harnessAccountAddress, harnessAccountPrivateKey } from '../core/config.ts'
import type { HarnessService } from '../core/service.ts'
import type { SafeSeedManifest } from './safe-contracts.ts'

export type RabbyEmulatorAccount = {
  address: string
  kind: 'mnemonic' | 'private-key' | 'watch' | 'safe' | 'hardware'
  name: string
  derivationPath?: string
}

export type RabbyEmulator = {
  accounts: RabbyEmulatorAccount[]
  cameraFile: string
  fragmentCount: number
  password: string
}

type Keyring = { type: string; data: unknown }

const width = 640
const height = 480

// Write QR pixels as a Chromium fake-camera video. Newframe still uses getUserMedia,
// the production pixel decoder, its QR receiver, and its real vault import.
async function writeCameraVideo(filename: string, frames: string[]) {
  const file = await fsp.open(filename, 'w', 0o600)
  const chroma = Buffer.alloc((width * height) / 2, 128)
  const writeFrame = async (luma: Buffer) => {
    await file.write(Buffer.from('FRAME\n'))
    await file.write(luma)
    await file.write(chroma)
  }
  try {
    await file.write(Buffer.from(`YUV4MPEG2 W${width} H${height} F10:1 Ip A1:1 C420jpeg\n`))
    // A brief blank leader leaves time to capture the scanner before data arrives.
    for (let index = 0; index < 8; index += 1) {
      await writeFrame(Buffer.alloc(width * height, 235))
    }
    for (const frame of frames) {
      const { modules } = QRCode.create(frame, { errorCorrectionLevel: 'M' })
      const margin = 4
      const scale = Math.floor((height - 16) / (modules.size + 2 * margin))
      const offsetX = Math.floor((width - modules.size * scale) / 2)
      const offsetY = Math.floor((height - modules.size * scale) / 2)
      const luma = Buffer.alloc(width * height, 235)
      for (let row = 0; row < modules.size; row += 1) {
        for (let column = 0; column < modules.size; column += 1) {
          if (!modules.get(row, column)) {
            continue
          }
          for (let y = 0; y < scale; y += 1) {
            const start = (offsetY + row * scale + y) * width + offsetX + column * scale
            luma.fill(16, start, start + scale)
          }
        }
      }
      await writeFrame(luma)
    }
  } finally {
    await file.close()
  }
}

function createAccounts(safeSeed: SafeSeedManifest) {
  const root = Wallet.createRandom()
  const mnemonic = root.mnemonic!.phrase
  const base = "m/44'/60'/0'/0"
  const hdSelections = [
    { name: 'Rabby Savings', base, type: 'BIP44', index: 0, path: `${base}/0` },
    { name: 'Rabby Trading', base, type: 'BIP44', index: 3, path: `${base}/3` },
    {
      name: 'Rabby Ledger Path',
      base: "m/44'/60'/0'/0/0",
      type: 'LedgerLive',
      index: 4,
      path: "m/44'/60'/4'/0/0"
    }
  ]
  const accounts: RabbyEmulatorAccount[] = []
  const details: Record<string, { hdPath: string; hdPathType: string; index: number }> = {}
  for (const selection of hdSelections) {
    const wallet = HDNodeWallet.fromPhrase(mnemonic, undefined, selection.path)
    details[wallet.address] = {
      hdPath: selection.base,
      hdPathType: selection.type,
      index: selection.index
    }
    accounts.push({
      address: wallet.address.toLowerCase(),
      kind: 'mnemonic',
      name: selection.name,
      derivationPath: selection.path
    })
  }
  const keyrings: Keyring[] = [
    {
      type: 'HD Key Tree',
      data: {
        mnemonic,
        publicKey: HDNodeWallet.fromPhrase(mnemonic, undefined, base).publicKey.slice(2),
        accountDetails: details
      }
    }
  ]
  for (const name of ['Rabby Imported Key', 'Rabby Secondary Key']) {
    const wallet = Wallet.createRandom()
    keyrings.push({ type: 'Simple Key Pair', data: [wallet.privateKey.slice(2)] })
    accounts.push({ address: wallet.address.toLowerCase(), kind: 'private-key', name })
  }
  keyrings.push({ type: 'Simple Key Pair', data: [harnessAccountPrivateKey.slice(2)] })
  accounts.push({ address: harnessAccountAddress, kind: 'private-key', name: 'Existing harness account' })

  const watch = Wallet.createRandom().address.toLowerCase()
  keyrings.push({ type: 'Watch Address', data: { accounts: [watch] } })
  accounts.push({ address: watch, kind: 'watch', name: 'Rabby Watch Account' })

  const safe = safeSeed.safe.toLowerCase()
  keyrings.push({
    type: 'Gnosis',
    data: {
      accounts: [safe],
      networkIdMap: { [safe]: String(safeSeed.chainId) },
      networkIdsMap: { [safe]: [String(safeSeed.chainId)] }
    }
  })
  accounts.push({ address: safe, kind: 'safe', name: 'Rabby Team Safe' })

  for (const [type, name] of [
    ['Ledger Hardware', 'Rabby Ledger'],
    ['Trezor Hardware', 'Rabby Trezor'],
    ['Onekey Hardware', 'Rabby OneKey'],
    ['QR Hardware Wallet Device', 'Rabby Keystone']
  ]) {
    const wallet = Wallet.createRandom()
    const derivationPath = `${base}/0`
    const data =
      type === 'QR Hardware Wallet Device'
        ? {
            version: 1,
            initialized: true,
            accounts: [wallet.address],
            currentAccount: 0,
            page: 0,
            perPage: 5,
            name: 'Keystone',
            keyringMode: 'pubkey',
            keyringAccount: 'account.ledger_live',
            xfp: '12345678',
            xpub: '',
            hdPath: '',
            indexes: { [wallet.address]: 0 },
            childrenPath: '0/*',
            paths: { [wallet.address]: derivationPath },
            brandsMap: { [wallet.address.toLowerCase()]: 'Keystone' }
          }
        : {
            accounts: [wallet.address],
            hdPath: base,
            page: 0,
            ...(type === 'Trezor Hardware' || type === 'Onekey Hardware'
              ? { paths: { [wallet.address]: 0 } }
              : {}),
            perPage: 5,
            unlockedAccount: 0,
            accountDetails: {
              [wallet.address]: { hdPath: derivationPath, hdPathType: 'BIP44', index: 0 }
            }
          }
    keyrings.push({ type, data })
    accounts.push({
      address: wallet.address.toLowerCase(),
      kind: 'hardware',
      name,
      derivationPath
    })
  }
  return { accounts, keyrings }
}

export class RabbyEmulatorService implements HarnessService<RabbyEmulator> {
  readonly name = 'Rabby Mobile Sync emulator'
  private directory?: string
  private readonly outputDir: string
  private readonly safeSeed: SafeSeedManifest

  constructor(outputDir: string, safeSeed: SafeSeedManifest) {
    this.outputDir = outputDir
    this.safeSeed = safeSeed
  }

  async start(): Promise<RabbyEmulator> {
    this.directory = await fsp.mkdtemp(path.join(this.outputDir, 'rabby-camera-'))
    const cameraFile = path.join(this.directory, 'mobile-sync.y4m')
    const password = 'Rabby harness import password'
    const { accounts, keyrings } = createAccounts(this.safeSeed)
    const envelope = {
      vault: JSON.parse(await encrypt(password, keyrings)) as unknown,
      whitelist: accounts.slice(0, 2).map(({ address }) => address),
      highligtedAddresses: [{ address: accounts[0].address, brandName: 'HD Key Tree' }],
      alianNames: accounts.map(({ address, name }) => ({ address, name, isAlias: true }))
    }
    // Rabby puts gzip bytes directly in UR.cbor, without a CBOR byte-string wrapper.
    const encoder = new UREncoder(
      new UR(Buffer.from(gzipSync(strToU8(JSON.stringify(envelope)))), 'bytes'),
      200
    )
    const fragmentCount = encoder.fragmentsLength
    // Rabby emits at 100 ms, while Newframe scans every 200 ms. Include fountain
    // redundancy so skipping alternate camera frames still reconstructs the data.
    const frames = Array.from({ length: fragmentCount * 8 }, () => encoder.nextPart())
    await writeCameraVideo(cameraFile, frames)
    return { accounts, cameraFile, fragmentCount, password }
  }

  async stop() {
    if (this.directory) {
      await fsp.rm(this.directory, { recursive: true, force: true })
    }
  }
}
