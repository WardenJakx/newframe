import { expect, it } from 'bun:test'
import { randomUUID } from 'node:crypto'

import { publicAccount, vectors, uiContext } from '../../../../../test/integration/fixtures/airgap.js'
import { createOperationService } from '../../../../platform/operations/service.js'
import AirGapAdapter from '../../../../platform/signing/signers/airgap/adapter.js'
import type AirGapSigner from '../../../../platform/signing/signers/airgap/AirGapSigner.js'
import createCanonicalStore from '../../../../platform/state-store/createCanonicalStore.js'
import { createProductionAirGapService } from './production.js'

function fixture() {
  const store = createCanonicalStore({
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined
  }).store
  const operations = createOperationService({ store, clock: { now: () => 1 } })
  const service = createProductionAirGapService(store, { get: () => undefined }, operations)
  return { store, operations, service }
}

it('pairs only for its owner, then restores and removes the public signer', () => {
  const f = fixture()
  const owner = uiContext()
  const operationId = randomUUID()
  const start = { type: 'signer.import', source: 'airgap', operationId } as const
  f.service.pairStart(start, owner.context)
  f.service.pairStart(start, owner.context)
  expect(owner.listenerCount()).toBe(1)
  expect(
    f.service.pairScan(
      { type: 'signer.session-input', operationId, frame: vectors.export.ur[0] },
      uiContext().context.owner
    )
  ).toBe(false)
  for (const frame of vectors.export.ur)
    f.service.pairScan({ type: 'signer.session-input', operationId, frame }, owner.context.owner)
  const [id] = Object.keys(f.store.getState().main.airgap)
  expect(
    f.operations.lookup({ id: operationId, owner: owner.context.owner, type: 'signer.airgap-pair' })
  ).toMatchObject({ phase: 'paired', status: 'succeeded', entityRefs: [{ type: 'signer', id }] })
  expect(f.store.getState().main.airgap[id]).toEqual(publicAccount())
  expect(f.store.getState().main.accounts).toEqual({})
  expect(owner.listenerCount()).toBe(0)

  f.store.getState().addAirGap('wrong-id', publicAccount())
  const adapter = new AirGapAdapter(f.store)
  const restored: AirGapSigner[] = []
  adapter.on('add', (signer: AirGapSigner) => restored.push(signer))
  adapter.open()
  expect(restored.map((signer) => signer.id)).toEqual([id])
  adapter.remove(restored[0])
  expect(f.store.getState().main.airgap[id]).toBeUndefined()
  adapter.close()
  f.service.dispose()
})

it('restarting, window destruction and app disposal release pairing listeners', () => {
  const f = fixture()
  const owner = uiContext()
  const first = randomUUID(),
    second = randomUUID()
  f.service.pairStart({ type: 'signer.import', source: 'airgap', operationId: first }, owner.context)
  f.service.pairStart({ type: 'signer.import', source: 'airgap', operationId: second }, owner.context)
  expect(
    f.operations.lookup({ id: first, owner: owner.context.owner, type: 'signer.airgap-pair' })?.phase
  ).toBe('cancelled')
  expect(owner.listenerCount()).toBe(1)
  owner.destroy()
  expect(
    f.operations.lookup({ id: second, owner: owner.context.owner, type: 'signer.airgap-pair' })?.phase
  ).toBe('cancelled')
  expect(owner.listenerCount()).toBe(0)
  const nextOwner = uiContext()
  f.service.pairStart(
    { type: 'signer.import', source: 'airgap', operationId: randomUUID() },
    nextOwner.context
  )
  f.service.dispose()
  expect(nextOwner.listenerCount()).toBe(0)
})
