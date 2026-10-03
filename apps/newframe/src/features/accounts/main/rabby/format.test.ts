import { expect, it } from 'bun:test'

import { encrypt } from '@metamask/browser-passworder'
import { HDNodeWallet, Mnemonic, Wallet } from 'ethers'

import { decodeRabbySnapshot } from './format'

const phrase = 'test test test test test test test test test test test junk'
const password = 'Rabby fixture password'
const privateKey = '11'.repeat(32)
const watch = '0x2222222222222222222222222222222222222222'
const safe = '0x3333333333333333333333333333333333333333'
const hardware = [4, 5, 6, 7].map((digit) => `0x${String(digit).repeat(40)}`)
const standard = HDNodeWallet.fromPhrase(phrase, '', "m/44'/60'/0'/0/3")
const legacy = HDNodeWallet.fromPhrase(phrase, '', "m/44'/60'/0'/2")
const live = HDNodeWallet.fromPhrase(phrase, '', "m/44'/60'/2'/0/0")

async function envelope(keyrings: unknown[], metadata: Record<string, unknown> = {}, current = false) {
  const vault = await encrypt(
    password,
    keyrings,
    undefined,
    undefined,
    current ? undefined : { algorithm: 'PBKDF2', params: { iterations: 10_000 } }
  )
  return JSON.stringify({
    vault: JSON.parse(vault) as unknown,
    whitelist: [],
    highligtedAddresses: [],
    alianNames: [],
    ...metadata
  })
}

async function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => 'unexpected success',
    (error: unknown) => (error instanceof Error ? error.message : 'unknown failure')
  )
}

it('decodes all Rabby keyrings, restores derivations, and scopes aliases to exported accounts', async () => {
  const data = await envelope(
    [
      {
        type: 'HD Key Tree',
        data: {
          mnemonic: phrase,
          publicKey: HDNodeWallet.fromPhrase(phrase, '', "m/44'/60'/0'/0").publicKey.slice(2),
          accountDetails: {
            [standard.address]: { hdPath: "m/44'/60'/0'/0", index: 3 },
            [legacy.address]: { hdPath: "m/44'/60'/0'", index: 2 },
            [live.address]: { hdPath: "m/44'/60'/0'/0/0", index: 2 }
          }
        }
      },
      { type: 'Simple Key Pair', data: [privateKey] },
      { type: 'Watch Address', data: { accounts: [watch] } },
      { type: 'Gnosis', data: { accounts: [safe], networkIdsMap: { [safe]: ['1', '137'] } } },
      ...['Ledger Hardware', 'Trezor Hardware', 'Onekey Hardware'].map((type, index) => ({
        type,
        data: {
          accounts: [hardware[index]],
          ...(type === 'Trezor Hardware' || type === 'Onekey Hardware'
            ? { paths: { [hardware[index]]: 8 } }
            : {}),
          accountDetails: { [hardware[index]]: { hdPath: "m/44'/60'/0'/0/8", index: 8 } }
        }
      })),
      {
        type: 'QR Hardware Wallet Device',
        data: {
          accounts: [hardware[3]],
          hdPath: '',
          keyringMode: 'pubkey',
          paths: { [hardware[3]]: "m/44'/60'/0'/0/9" }
        }
      }
    ],
    {
      alianNames: [
        { address: standard.address, name: 'My savings' },
        { address: '0x8888888888888888888888888888888888888888', name: 'Unselected' }
      ],
      whitelist: [watch],
      highligtedAddresses: [{ address: watch, brandName: 'Watch Address' }]
    },
    true
  )
  const snapshot = await decodeRabbySnapshot(data, password)
  expect(snapshot.accounts).toHaveLength(10)
  expect(snapshot.accounts.find((account) => account.address === standard.address)).toMatchObject({
    name: 'My savings',
    source: { derivationPath: standard.path },
    secret: { kind: 'seed', seed: Mnemonic.fromPhrase(phrase).computeSeed().slice(2), path: standard.path }
  })
  expect(snapshot.accounts.find((account) => account.address === legacy.address)?.secret).toMatchObject({
    path: legacy.path
  })
  expect(snapshot.accounts.find((account) => account.address === live.address)?.secret).toMatchObject({
    path: live.path
  })
  expect(
    snapshot.accounts.find((account) => account.address === new Wallet(`0x${privateKey}`).address)?.kind
  ).toBe('private-key')
  expect(snapshot.accounts.find((account) => account.address.toLowerCase() === safe)?.chainIds).toEqual([
    1, 137
  ])
  expect(
    snapshot.accounts
      .filter((account) => account.kind === 'hardware')
      .every((account) => Boolean(account.warning))
  ).toBe(true)
  expect(snapshot.accounts.at(-1)?.source?.derivationPath).toBe("m/44'/60'/0'/0/9")
  expect(snapshot.unsupportedMetadata).toEqual(['Pinned accounts', 'Recipient whitelist'])
})

it('accepts OneKey and Trezor numeric path maps and restores older records without accountDetails', async () => {
  const keyrings = ['Onekey Hardware', 'Trezor Hardware'].map((type, index) => ({
    type,
    data: {
      hdPath: "m/44'/60'/0'/0",
      accounts: [hardware[index]],
      page: 0,
      paths: { [hardware[index]]: index + 3 },
      perPage: 5,
      unlockedAccount: 0,
      accountDetails:
        index === 0
          ? { [hardware[index]]: { hdPath: "m/44'/60'/0'/0/3", hdPathType: 'BIP44', index: 3 } }
          : {}
    }
  }))
  const snapshot = await decodeRabbySnapshot(await envelope(keyrings), password)
  expect(snapshot.accounts.map((account) => account.source?.derivationPath)).toEqual([
    "m/44'/60'/0'/0/3",
    "m/44'/60'/0'/0/4"
  ])
  expect(snapshot.accounts.every((account) => account.kind === 'hardware' && Boolean(account.warning))).toBe(
    true
  )
  const malformed = {
    type: 'Onekey Hardware',
    data: { accounts: [hardware[0]], paths: { [hardware[0]]: "m/44'/60'/0'/0/3" } }
  }
  expect(await rejection(decodeRabbySnapshot(await envelope([malformed]), password))).toContain(
    'invalid account data'
  )
})

it('rejects derived-address mismatches, malformed hardware/Safe records, and excessive KDF work', async () => {
  for (const entry of [
    {
      type: 'HD Key Tree',
      data: { mnemonic: phrase, accountDetails: { [watch]: { hdPath: "m/44'/60'/0'/0", index: 3 } } }
    },
    { type: 'Gnosis', data: { accounts: [safe], networkIdsMap: { [safe]: ['not-a-network'] } } },
    { type: 'Ledger Hardware', data: { accounts: ['invalid-address'] } }
  ]) {
    expect(await rejection(decodeRabbySnapshot(await envelope([entry]), password))).toContain(
      'invalid account data'
    )
  }
  const encoded = JSON.parse(await envelope([{ type: 'Watch Address', data: { accounts: [watch] } }])) as {
    vault: { keyMetadata: { params: { iterations: number } } }
  }
  encoded.vault.keyMetadata.params.iterations = 100_000_000
  expect(await rejection(decodeRabbySnapshot(JSON.stringify(encoded), password))).toContain(
    'invalid account data'
  )
})

it('supports legacy vault derivation and lets a correct password retry after failure', async () => {
  const encoded = JSON.parse(await envelope([{ type: 'Watch Address', data: { accounts: [watch] } }])) as {
    vault: { keyMetadata?: unknown }
  }
  delete encoded.vault.keyMetadata
  const data = JSON.stringify(encoded)
  expect(await rejection(decodeRabbySnapshot(data, 'wrong'))).toContain('Check your Rabby password')
  expect((await decodeRabbySnapshot(data, password)).accounts[0]?.address.toLowerCase()).toBe(watch)
})

it('rejects oversized Keystone paths before returning any signing account', async () => {
  const data = await envelope([
    { type: 'Simple Key Pair', data: [privateKey] },
    {
      type: 'QR Hardware Wallet Device',
      data: {
        accounts: [hardware[0]],
        keyringMode: 'hd',
        hdPath: `m/${Array<string>(120).fill('0').join('/')}`,
        childrenPath: Array<string>(60).fill('0').join('/'),
        indexes: { [hardware[0]]: 0 }
      }
    }
  ])
  expect(await rejection(decodeRabbySnapshot(data, password))).toContain('invalid account data')
})
