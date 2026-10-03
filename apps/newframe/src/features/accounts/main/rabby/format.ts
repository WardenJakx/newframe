import { decrypt } from '@metamask/browser-passworder'
import { HDKey } from '@scure/bip32'
import { computeAddress, getAddress, Mnemonic, Wallet } from 'ethers'
import { z } from 'zod'

const address = z
  .string()
  .refine((value) => /^0x[0-9a-f]{40}$/i.test(value))
  .transform((value) => getAddress(value.toLowerCase()))
const path = z
  .string()
  .max(256)
  .regex(/^m(?:\/(?:0|[1-9][0-9]*)'?)+$/)
const index = z.number().int().min(0).max(0x7fffffff)
const accounts = z.array(address).min(1).max(1000)
const details = z.record(address, z.looseObject({ hdPath: path, index }))
const base64 = z
  .string()
  .max(2_000_000)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/)
const envelopeSchema = z.looseObject({
  vault: z.strictObject({
    data: base64,
    iv: base64,
    salt: base64,
    keyMetadata: z
      .strictObject({
        algorithm: z.literal('PBKDF2'),
        params: z.strictObject({ iterations: z.number().int().min(10_000).max(2_000_000) })
      })
      .optional()
  }),
  whitelist: z.array(address).max(1000).default([]),
  highligtedAddresses: z
    .array(z.looseObject({ address, brandName: z.string().max(128) }))
    .max(1000)
    .default([]),
  alianNames: z
    .array(z.looseObject({ address, name: z.string().trim().max(128) }))
    .max(1000)
    .default([])
})
const vaultSchema = z
  .array(z.strictObject({ type: z.string().max(128), data: z.unknown() }))
  .min(1)
  .max(1000)

type RabbyAccountKind = 'mnemonic' | 'private-key' | 'watch' | 'safe' | 'hardware'
export type RabbyAccount = {
  address: string
  name: string
  kind: RabbyAccountKind
  chainIds?: number[]
  warning?: string
  source?: { type: string; derivationPath?: string }
  secret?: { kind: 'seed'; seed: string; path: string } | { kind: 'key'; privateKey: string }
}
export type RabbySnapshot = { accounts: RabbyAccount[]; unsupportedMetadata: string[] }

export class RabbyImportError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export async function decodeRabbySnapshot(data: string, password: string): Promise<RabbySnapshot> {
  if (!data || data.length > 2_000_000 || !password || password.length > 1024) {
    throw new RabbyImportError('invalid_snapshot', 'Rabby export is invalid or too large.')
  }
  try {
    const envelope = envelopeSchema.parse(JSON.parse(data))
    const ivLength = Buffer.from(envelope.vault.iv, 'base64').length
    const saltLength = Buffer.from(envelope.vault.salt, 'base64').length
    if (
      ![12, 16].includes(ivLength) ||
      saltLength < 16 ||
      saltLength > 64 ||
      Buffer.from(envelope.vault.data, 'base64').length < 17
    ) {
      throw new RabbyImportError('invalid_snapshot', 'Rabby export is invalid.')
    }
    let decrypted: unknown
    try {
      decrypted = await decrypt(password, JSON.stringify(envelope.vault))
    } catch {
      throw new RabbyImportError(
        'authentication_failed',
        'Could not decrypt the Rabby export. Check your Rabby password.'
      )
    }
    const keyrings = vaultSchema.parse(decrypted)
    const result: RabbyAccount[] = []
    const add = (account: RabbyAccount) => {
      if (result.length >= 1000) {
        throw new RabbyImportError('invalid_snapshot', 'Rabby export contains too many accounts.')
      }
      const existing = result.find(
        (candidate) => candidate.address.toLowerCase() === account.address.toLowerCase()
      )
      if (existing) {
        if (existing.kind === 'safe' && account.kind === 'safe') {
          existing.chainIds = [...new Set([...(existing.chainIds ?? []), ...(account.chainIds ?? [])])]
          return
        }
        throw new RabbyImportError('invalid_snapshot', 'Rabby export contains conflicting account records.')
      }
      result.push(account)
    }
    for (const keyring of keyrings) {
      if (keyring.type === 'HD Key Tree') {
        const record = z
          .looseObject({
            mnemonic: z.string().max(512),
            publicKey: z.string().max(132).optional(),
            accountDetails: details
          })
          .parse(keyring.data)
        if (
          !Mnemonic.isValidMnemonic(record.mnemonic) ||
          Object.keys(record.accountDetails).length === 0 ||
          Object.keys(record.accountDetails).length > 1000
        ) {
          throw new Error('Invalid HD keyring')
        }
        const seed = Mnemonic.fromPhrase(record.mnemonic).computeSeed().slice(2)
        const seedBytes = Buffer.from(seed, 'hex')
        const root = HDKey.fromMasterSeed(seedBytes)
        try {
          if (record.publicKey) {
            const base = root.derive("m/44'/60'/0'/0")
            try {
              if (
                !base.publicKey ||
                Buffer.from(base.publicKey).toString('hex') !==
                  record.publicKey.replace(/^0x/, '').toLowerCase()
              ) {
                throw new Error('Invalid HD public key')
              }
            } finally {
              base.wipePrivateData()
            }
          }
          for (const [claimed, detail] of Object.entries(record.accountDetails)) {
            const fullPath =
              detail.hdPath === "m/44'/60'/0'/0/0"
                ? `m/44'/60'/${detail.index}'/0/0`
                : `${detail.hdPath}/${detail.index}`
            const child = root.derive(fullPath)
            try {
              if (
                !child.publicKey ||
                computeAddress(`0x${Buffer.from(child.publicKey).toString('hex')}`).toLowerCase() !==
                  claimed.toLowerCase()
              ) {
                throw new Error('HD address mismatch')
              }
              add({
                address: claimed,
                name: 'Rabby Seed Account',
                kind: 'mnemonic',
                source: { type: keyring.type, derivationPath: fullPath },
                secret: { kind: 'seed', seed, path: fullPath }
              })
            } finally {
              child.wipePrivateData()
            }
          }
        } finally {
          root.wipePrivateData()
          seedBytes.fill(0)
        }
      } else if (keyring.type === 'Simple Key Pair') {
        const keys = z
          .array(z.string().regex(/^(?:0x)?[0-9a-f]{64}$/i))
          .min(1)
          .max(1000)
          .parse(keyring.data)
        for (const privateKey of keys) {
          add({
            address: new Wallet(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`).address,
            name: 'Rabby Private Key Account',
            kind: 'private-key',
            secret: { kind: 'key', privateKey }
          })
        }
      } else if (keyring.type === 'Watch Address') {
        for (const value of z.looseObject({ accounts }).parse(keyring.data).accounts) {
          add({ address: value, name: 'Rabby Watch Account', kind: 'watch' })
        }
      } else if (keyring.type === 'Gnosis') {
        const networkIds = z
          .array(z.string().regex(/^[1-9][0-9]*$/))
          .min(1)
          .max(100)
        const record = z
          .looseObject({
            accounts,
            networkIdsMap: z.record(address, networkIds).optional(),
            networkIdMap: z.record(address, z.string().regex(/^[1-9][0-9]*$/)).optional()
          })
          .parse(keyring.data)
        for (const value of record.accounts) {
          const matched = Object.entries(record.networkIdsMap ?? {}).find(
            ([key]) => key.toLowerCase() === value.toLowerCase()
          )?.[1]
          const legacy = Object.entries(record.networkIdMap ?? {}).find(
            ([key]) => key.toLowerCase() === value.toLowerCase()
          )?.[1]
          const chainIds = [...new Set((matched ?? (legacy ? [legacy] : [])).map(Number))]
          if (
            !chainIds.length ||
            chainIds.some((chainId) => !Number.isSafeInteger(chainId) || chainId <= 0)
          ) {
            throw new Error('Invalid Safe networks')
          }
          add({ address: value, name: 'Rabby Safe Account', kind: 'safe', chainIds })
        }
      } else if (
        ['Ledger Hardware', 'Trezor Hardware', 'Onekey Hardware', 'QR Hardware Wallet Device'].includes(
          keyring.type
        )
      ) {
        const record = z
          .looseObject({
            accounts,
            accountDetails: z
              .record(address, z.looseObject({ hdPath: path, index: index.optional() }))
              .optional(),
            hdPath: z.union([path, z.literal('')]).optional()
          })
          .parse(keyring.data)
        // OneKey and Trezor store address -> account index in `paths`. Keystone
        // uses the same property name for full derivation-path strings.
        const usb = ['Onekey Hardware', 'Trezor Hardware'].includes(keyring.type)
          ? z.looseObject({ paths: z.record(address, index).optional() }).parse(keyring.data)
          : undefined
        const qr =
          keyring.type === 'QR Hardware Wallet Device'
            ? z
                .looseObject({
                  keyringMode: z.enum(['hd', 'pubkey']).optional(),
                  paths: z.record(address, path).optional(),
                  indexes: z.record(address, index).optional(),
                  childrenPath: z
                    .string()
                    .max(128)
                    .regex(/^(?:[0-9]+|\*)(?:\/(?:[0-9]+|\*))*$/)
                    .optional()
                })
                .parse(keyring.data)
            : undefined
        for (const value of record.accounts) {
          const detail = Object.entries(record.accountDetails ?? {}).find(
            ([key]) => key.toLowerCase() === value.toLowerCase()
          )?.[1]
          let derivationPath = detail?.hdPath ?? record.hdPath
          if (derivationPath === '') {
            derivationPath = undefined
          }
          if (!detail && usb && record.hdPath) {
            const accountIndex = Object.entries(usb.paths ?? {}).find(
              ([key]) => key.toLowerCase() === value.toLowerCase()
            )?.[1]
            if (accountIndex !== undefined) {
              derivationPath = `${record.hdPath}/${accountIndex}`
            }
          }
          if (qr) {
            const full = Object.entries(qr.paths ?? {}).find(
              ([key]) => key.toLowerCase() === value.toLowerCase()
            )?.[1]
            const accountIndex = Object.entries(qr.indexes ?? {}).find(
              ([key]) => key.toLowerCase() === value.toLowerCase()
            )?.[1]
            if (qr.keyringMode === 'pubkey') {
              if (!full) {
                throw new Error('Hardware derivation missing')
              }
              derivationPath = full
            } else if (record.hdPath && accountIndex !== undefined) {
              derivationPath = `${record.hdPath}/${(qr.childrenPath ?? '0/*').replace('*', String(accountIndex)).replace(/\*/g, '0')}`
            }
          }
          if (derivationPath !== undefined) {
            derivationPath = path.parse(derivationPath)
          }
          add({
            address: value,
            name: 'Rabby Hardware Account',
            kind: 'hardware',
            warning: 'Imported as watch-only. Reconnect your hardware wallet to sign.',
            source: { type: keyring.type, ...(derivationPath ? { derivationPath } : {}) }
          })
        }
      } else {
        throw new RabbyImportError(
          'unsupported_keyring',
          'This Rabby export contains an unsupported wallet type.'
        )
      }
    }
    const aliases = new Map(envelope.alianNames.map((alias) => [alias.address.toLowerCase(), alias.name]))
    result.forEach((account) => {
      const alias = aliases.get(account.address.toLowerCase())
      if (alias !== undefined && alias.length > 0) {
        account.name = alias
      }
    })
    if (!result.length) {
      throw new Error('Empty export')
    }
    return {
      accounts: result,
      unsupportedMetadata: [
        ...(envelope.highligtedAddresses.length ? ['Pinned accounts'] : []),
        ...(envelope.whitelist.length ? ['Recipient whitelist'] : [])
      ]
    }
  } catch (error) {
    if (error instanceof RabbyImportError) {
      throw error
    }
    throw new RabbyImportError('invalid_snapshot', 'Rabby export contains invalid account data.')
  }
}
