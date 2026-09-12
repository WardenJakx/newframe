import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import log from 'electron-log'
import { Mnemonic, randomBytes } from 'ethers'

import { electronMock } from '../../../../../../test/support/electron.mock.ts'
import { callbackResult, exerciseHotSignerContract } from '../../callback.test-support.ts'

const USER_DATA = fs.mkdtempSync(path.join(tmpdir(), 'newframe-seed-test-'))
const SIGNER_PATH = path.join(USER_DATA, 'signers')
const removePath = (target: string) => rm(target, { recursive: true, force: true })
const vaultKey = '12'.repeat(32)
let unlocked = true
const vault = {
  acquireKey: () => {
    unlocked = true
    return vaultKey
  },
  getKey: () => (unlocked ? vaultKey : null),
  lock: () => {
    unlocked = false
  }
}

let hot: typeof import('..')

describe('Seed signer', () => {
  let signer: any

  beforeAll(async () => {
    log.transports.console.level = false
    electronMock.app.getPath.mockReturnValue(USER_DATA)
    hot = await import('..')
  })

  afterAll(async () => {
    await removePath(USER_DATA)
    log.transports.console.level = 'debug'
  })

  test('rejects invalid phrases', async () => {
    await expect(
      callbackResult((done) =>
        hot.createFromPhrase(vault, { add: () => {}, exists: () => false }, 'invalid', '', done)
      )
    ).rejects.toThrow('Invalid mnemonic phrase')
  })

  test('stores one versioned encrypted seed and loads it without rewriting', async () => {
    const added: any[] = []
    signer = await callbackResult((done) =>
      hot.createFromPhrase(
        vault,
        { add: (value) => added.push(value), exists: () => false },
        Mnemonic.fromEntropy(randomBytes(16)).phrase,
        '',
        done
      )
    )
    expect(signer.addresses).toHaveLength(100)
    const signerFile = path.resolve(SIGNER_PATH, `${signer.id}.json`)
    const before = fs.readFileSync(signerFile, 'utf8')
    const stored = JSON.parse(before)
    expect(stored).toMatchObject({ version: 1, type: 'seed' })
    expect(stored.encryptedSeed.algorithm).toBe('aes-256-gcm')
    expect(before).not.toContain('mnemonic')

    const loaded: any[] = []
    fs.writeFileSync(
      path.resolve(SIGNER_PATH, 'legacy.json'),
      JSON.stringify({ ...stored, version: undefined })
    )
    fs.writeFileSync(
      path.resolve(SIGNER_PATH, 'malformed-seed.json'),
      JSON.stringify({
        ...stored,
        encryptedSeed: { ...stored.encryptedSeed, ciphertext: '00' }
      })
    )
    hot.load({ add: (value) => loaded.push(value), exists: () => false }, vault)
    expect(loaded).toHaveLength(1)
    expect(fs.readFileSync(signerFile, 'utf8')).toBe(before)
  })

  test('signs and exports only while the vault is unlocked', async () => {
    unlocked = true
    await exerciseHotSignerContract(signer, vault)
  })

  test('preserves the multi-chain legacy transaction signatures', async () => {
    unlocked = true
    const privateKey = '4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356'
    const fixed = await callbackResult<any>((done) =>
      hot.createFromPrivateKey(vault, { add: () => {}, exists: () => false }, privateKey, '', done)
    )
    const rawTx = {
      from: '0xa8967e43a9b18e665ba26f649a66e790d9325600',
      to: '0xbe188d6641e8b680743a4815dfa0f6208038960f',
      value: '0xb5e620f48000',
      data: '0x',
      gasLimit: '0x5208',
      type: '0x0',
      gasPrice: '0xb2d05e00'
    }
    const chains = [
      [
        1,
        '0xf8698084b2d05e0082520894be188d6641e8b680743a4815dfa0f6208038960f86b5e620f480008025a0c8ca5f76f568578bebbdfc257be09d8e8a4512d0ffd45e991da86be8141d97e0a037179047d9810e211657d9dd60d4bac66ed576fd65ef65a55f007314587036ec'
      ],
      [
        10,
        '0xf8698084b2d05e0082520894be188d6641e8b680743a4815dfa0f6208038960f86b5e620f480008037a06340cc640986ddbc095d65bdd5217e4f25168e0fb7d097e4f6ce1c739e4adb96a0645e1173cf2fdc318c4af839dd52a3dc408b0c60b0246e96a0b0f5bf7edbe614'
      ],
      [
        69,
        '0xf86a8084b2d05e0082520894be188d6641e8b680743a4815dfa0f6208038960f86b5e620f480008081aea0a0df2fd26c2f8a5e9531d6cbe7c8246d2f82a1524e17c545076e7637e0dcf338a028629bc1ae46c5e27eeb2cb41b9a87618e2224778138be8cb4e5c17d1c8d3494'
      ],
      [
        100,
        '0xf86a8084b2d05e0082520894be188d6641e8b680743a4815dfa0f6208038960f86b5e620f480008081eba021839bde3d4c41b1fb83c5c97e7d9cb4f4d4fc86fc338faa44a3a223db4213a5a0157a154afec7aa17cd94f9c7a6a1545f701a99f0e1edb4997504eb9fd3ad8813'
      ],
      [
        137,
        '0xf86b8084b2d05e0082520894be188d6641e8b680743a4815dfa0f6208038960f86b5e620f4800080820135a09235ef8a65bff6d8e117bd13653fafcb2225763f4a11aa29886464530e009cfaa03fcd6b8ac39c1b3f375efcd3e4558b5c44cf167f2de800a63a008a86ed3dba25'
      ],
      [
        42161,
        '0xf86c8084b2d05e0082520894be188d6641e8b680743a4815dfa0f6208038960f86b5e620f480008083014985a07f874b1f31b10c8ec507f74a3803f6d6a52e93790e9e502bcf74b2cc07bb169aa013ff12c35ed91966d8e3f042971c0fab1d236f5888af7315007baa0eab0938c9'
      ],
      [
        80001,
        '0xf86c8084b2d05e0082520894be188d6641e8b680743a4815dfa0f6208038960f86b5e620f480008083027126a00f42c66986e1d7ca6e77891e3cf0cd8fe360ed0a92732523bf29756f18e37255a07688e781db1d625a2c4234c5a61c3a9093643a326060caf5b58ad05fdf1f4233'
      ],
      [
        11155111,
        '0xf86d8084b2d05e0082520894be188d6641e8b680743a4815dfa0f6208038960f86b5e620f48000808401546d72a0cf0656010c7e68ba6ad17a528f1e0280ec7b96ae93a2edbee399e771a2d46c85a07d77731cb4218a55bccc690d49238a82bc3051884356eb57bc2e582b57d5a46a'
      ]
    ] as const
    for (const [chainId, expected] of chains) {
      const signed = await callbackResult<string>((done) =>
        fixed.signTransaction(0, { ...rawTx, chainId: chainId.toString(16) }, done)
      )
      expect(signed).toBe(expected)
    }
    await expect(callbackResult((done) => fixed.signTransaction(0, rawTx, done))).rejects.toThrow(
      'could not determine chain id for transaction'
    )
  })
})
