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
    const commandTypes = new Set(Object.keys(commandContracts))
    const collisions = Object.keys(queryContracts).filter((type) => commandTypes.has(type))

    expect(collisions).toEqual([])
    expect(queryContracts['keystore.locate'].input.parse({ type: 'keystore.locate' })).toEqual({
      type: 'keystore.locate'
    })
  })
})
