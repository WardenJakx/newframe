import { describe, expect, it } from 'bun:test'
import { z } from 'zod'

import {
  commandContracts,
  queryContracts,
  type CommandMap,
  type CommandResult,
  type QueryMap,
  type QueryResultMap,
  type ResultForQuery
} from './operations'

type InputWithDiscriminants = {
  shape?: { type: z.ZodType }
  options?: { shape: { type: z.ZodType } }[]
}

function inputDiscriminants(input: z.ZodType) {
  const schema = input as InputWithDiscriminants
  return schema.shape ? [schema.shape.type] : (schema.options || []).map((option) => option.shape.type)
}

describe('operation contract catalogs', () => {
  it('owns aligned discriminants, derived result parsing, and disjoint operation keys', () => {
    expect(Object.keys(commandContracts)).toHaveLength(74)
    expect(Object.keys(queryContracts)).toHaveLength(9)

    for (const [type, contract] of Object.entries(commandContracts)) {
      const discriminants = inputDiscriminants(contract.input)
      expect(discriminants.length).toBeGreaterThan(0)
      for (const discriminant of discriminants) {
        expect(discriminant.parse(type)).toBe(type)
        expect(discriminant.safeParse(`${type}.other`).success).toBeFalse()
      }
    }

    for (const [type, contract] of Object.entries(queryContracts)) {
      const discriminants = inputDiscriminants(contract.input)
      expect(discriminants.length).toBeGreaterThan(0)
      for (const discriminant of discriminants) {
        expect(discriminant.parse(type)).toBe(type)
        expect(discriminant.safeParse(`${type}.other`).success).toBeFalse()
      }
    }
    const command = {
      type: 'account.select',
      accountId: 'account-1'
    } satisfies CommandMap['account.select']
    const commandResult: CommandResult = commandContracts[command.type].result.parse({
      ok: true
    })

    const query = { type: 'name.resolve', name: 'alice.eth' } satisfies QueryMap['name.resolve']
    const queryResult: QueryResultMap[typeof query.type] = queryContracts[query.type].result.parse({
      ok: true,
      address: '0x1111111111111111111111111111111111111111'
    })
    const publicQueryResult: ResultForQuery<typeof query> = queryResult

    expect(commandResult).toEqual({ ok: true })
    expect(publicQueryResult).toEqual({
      ok: true,
      address: '0x1111111111111111111111111111111111111111'
    })
    expect(() => commandContracts[command.type].result.parse({ ok: true, extra: true })).toThrow()
    expect(() => queryContracts[query.type].result.parse({ ok: true })).toThrow()
    const operationCommandsWithoutOperationIds = [
      { type: 'profile.select', profileId: 'work' },
      { type: 'profile.create', name: 'Work' },
      { type: 'profile.rename', profileId: 'work', name: 'Renamed' },
      { type: 'profile.delete', profileId: 'work' },
      { type: 'account.profile-move', accountId: 'account-1', profileId: 'work' },
      { type: 'portfolio.refresh' },
      { type: 'security.configure', mode: 'disabled' },
      { type: 'security.unlock', method: 'native' },
      { type: 'wallet.lock' },
      { type: 'wallet.reset', scope: 'saved-data' },
      { type: 'account.add-from-signer', signerId: 'seed-1', address: '0x1' },
      { type: 'account.watch-add', addressOrName: 'alice.eth' },
      {
        type: 'signer.import',
        source: 'phrase',
        phrase: 'local phrase',
        framePassword: 'local password'
      },
      { type: 'signer.lattice-create', deviceId: 'device-1', deviceName: 'GridPlus' },
      { type: 'signer.disconnect', signerId: 'signer-1' },
      { type: 'signer.reload', signerId: 'signer-1' },
      {
        type: 'send.submit',
        asset: { address: '0x0000000000000000000000000000000000000000', chainId: 1 },
        amount: '1',
        recipient: 'alice.eth'
      },
      { type: 'signer.ledger-accounts-load', signerId: 'ledger-1', accountCount: 5 },
      { type: 'signer.hardware-session-start', signerId: 'trezor-1' },
      {
        type: 'signer.hardware-session-finish',
        signerId: 'trezor-1',
        outcome: 'cancelled'
      },
      {
        type: 'token.add',
        token: {
          address: '0x1111111111111111111111111111111111111111',
          chainId: 1,
          decimals: 18,
          name: 'Token',
          symbol: 'TKN'
        }
      }
    ] as const
    for (const input of operationCommandsWithoutOperationIds) {
      const type = input.type
      expect(commandContracts[type].input.safeParse(input).success).toBeFalse()
      expect(commandContracts[type].result.safeParse({ ok: true, profileId: 'leaked' }).success).toBeFalse()
    }
    const commandTypes = new Set(Object.keys(commandContracts))
    const collisions = Object.keys(queryContracts).filter((type) => commandTypes.has(type))

    expect(collisions).toEqual([])
    expect(queryContracts['keystore.locate'].input.parse({ type: 'keystore.locate' })).toEqual({
      type: 'keystore.locate'
    })
    const configure = commandContracts['security.configure'].input
    expect(
      configure.safeParse({
        type: 'security.configure',
        operationId: 'configure',
        mode: 'best-available',
        browser: { status: 'unavailable' }
      }).success
    ).toBeTrue()
    expect(
      configure.safeParse({
        type: 'security.configure',
        operationId: 'configure',
        mode: 'best-available',
        browser: { status: 'failed', message: 'raw browser error' }
      }).success
    ).toBeFalse()
    expect(
      configure.safeParse({
        type: 'security.configure',
        operationId: 'configure',
        mode: 'native'
      }).success
    ).toBeFalse()
  })
})
