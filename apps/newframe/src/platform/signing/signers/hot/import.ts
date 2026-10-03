import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

import crypt from '../../crypt.js'
import type { HotSignerImport } from '../../domain/hotImport.js'
import { sealSecret } from './secret.js'
import { StoredHotSignerSchema, type StoredHotSigner } from './stored.js'

export function prepareImportedHotSigners(inputs: HotSignerImport[], vaultKey: string): StoredHotSigner[] {
  const seeds = new Map<string, HotSignerImport[]>()
  const records: StoredHotSigner[] = []
  const id = (addresses: string[]) => crypt.stringToKey(addresses.join()).toString('hex')
  for (const input of inputs) {
    if (input.secret.kind === 'seed') {
      seeds.set(input.secret.seed, [...(seeds.get(input.secret.seed) ?? []), input])
    } else {
      const privateKey = Buffer.from(input.secret.privateKey.replace(/^0x/, ''), 'hex')
      try {
        records.push({
          version: 1,
          id: id([input.address]),
          type: 'ring',
          addresses: [input.address],
          encryptedKeys: [sealSecret(privateKey, vaultKey)]
        })
      } finally {
        privateKey.fill(0)
      }
    }
  }
  for (const [seed, entries] of seeds) {
    const seedBytes = Buffer.from(seed, 'hex')
    try {
      const addresses = entries.map((entry) => entry.address)
      records.push({
        version: 1,
        id: id(addresses),
        type: 'seed',
        addresses,
        encryptedSeed: sealSecret(seedBytes, vaultKey),
        derivationPaths: entries.map((entry) => {
          if (entry.secret.kind !== 'seed') {
            throw new Error('Invalid imported signer')
          }
          return entry.secret.path
        })
      })
    } finally {
      seedBytes.fill(0)
    }
  }
  return records.map((record) => StoredHotSignerSchema.parse(record))
}

const electronApp = app as typeof app | undefined
const defaultDirectory = path.resolve(
  electronApp ? electronApp.getPath('userData') : path.resolve(import.meta.dirname, '.userData'),
  'signers'
)

// Stage every encrypted record before publishing any account. On a write or commit
// failure, remove only files created by this import, leaving existing signers intact.
export function persistImportedHotSigners<T>(
  records: StoredHotSigner[],
  commit: () => T,
  directory = defaultDirectory
): T {
  const staged: Array<{ temporary: string; final: string; published: boolean }> = []
  try {
    if (records.length) {
      fs.mkdirSync(directory, { recursive: true })
    }
    for (const raw of records) {
      const record = StoredHotSignerSchema.parse(raw)
      if (!/^[0-9a-f]{64}$/.test(record.id)) {
        throw new Error('Invalid signer identity')
      }
      const final = path.join(directory, `${record.id}.json`)
      if (fs.existsSync(final)) {
        throw new Error('Signer record already exists')
      }
      const temporary = path.join(directory, `${record.id}.${randomUUID()}.tmp`)
      staged.push({ temporary, final, published: false })
      fs.writeFileSync(temporary, JSON.stringify(record), { mode: 0o600, flag: 'wx' })
    }
    for (const entry of staged) {
      // Hard-link avoids replacing an existing record, even if another writer won
      // the race after the existence check.
      fs.linkSync(entry.temporary, entry.final)
      entry.published = true
      fs.unlinkSync(entry.temporary)
    }
    return commit()
  } catch (error) {
    for (const entry of staged) {
      fs.rmSync(entry.temporary, { force: true })
      if (entry.published) {
        fs.rmSync(entry.final, { force: true })
      }
    }
    throw error
  }
}
