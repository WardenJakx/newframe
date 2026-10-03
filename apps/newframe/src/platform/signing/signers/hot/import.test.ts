import { expect, it } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { HDNodeWallet, Mnemonic, recoverAddress, hashMessage } from 'ethers'

import { persistImportedHotSigners, prepareImportedHotSigners } from './import'
import SeedSigner from './SeedSigner'

const vaultKey = 'ab'.repeat(32)
const phrase = 'test test test test test test test test test test test junk'

it('reloads and signs selected custom seed paths from encrypted records', async () => {
  const derivationPath = "m/44'/60'/7'/0/23"
  const wallet = HDNodeWallet.fromPhrase(phrase, '', derivationPath)
  const [record] = prepareImportedHotSigners(
    [
      {
        address: wallet.address,
        secret: {
          kind: 'seed',
          seed: Mnemonic.fromPhrase(phrase).computeSeed().slice(2),
          path: derivationPath
        }
      }
    ],
    vaultKey
  )
  if (record.type !== 'seed') {
    throw new Error('Expected seed')
  }
  const signer = new SeedSigner(record, { getKey: () => vaultKey })
  const signature = await new Promise<string>((resolve, reject) =>
    signer.signMessage(0, 'import verification', (error, value) => (error ? reject(error) : resolve(value!)))
  )
  expect(recoverAddress(hashMessage('import verification'), signature)).toBe(wallet.address)
  expect(JSON.stringify(record)).not.toContain(phrase)
  expect(record.derivationPaths).toEqual([derivationPath])
})

it('removes staged encrypted files after commit failures and preserves preexisting records', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'newframe-rabby-'))
  try {
    const record = prepareImportedHotSigners(
      [
        {
          address: '0x1111111111111111111111111111111111111111',
          secret: { kind: 'key', privateKey: '11'.repeat(32) }
        }
      ],
      vaultKey
    )[0]
    expect(() =>
      persistImportedHotSigners(
        [record],
        () => {
          throw new Error('Persistence unavailable')
        },
        directory
      )
    ).toThrow('Persistence unavailable')
    expect(fs.readdirSync(directory)).toEqual([])
    persistImportedHotSigners([record], () => undefined, directory)
    const filename = path.join(directory, `${record.id}.json`)
    const original = fs.readFileSync(filename, 'utf8')
    expect(() => persistImportedHotSigners([record], () => undefined, directory)).toThrow('already exists')
    expect(fs.readFileSync(filename, 'utf8')).toBe(original)
    expect(fs.statSync(filename).mode & 0o777).toBe(0o600)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
