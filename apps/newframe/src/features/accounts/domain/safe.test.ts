import { expect, it } from 'bun:test'

import { Interface } from 'ethers'

import { safeProposalActions, unpackMultiSend, type SafeProposal } from './safe.ts'
import { safeAppTransactionUrl } from './safeChains.ts'

const multiSendCallOnly = '0x40A2aCCbd92BCA938b02010E17A5b8929b49130D'
// Pending BNB Chain batch on Safe 0x4d8D99be16a38D5809f3A9BcDc221c45a56A6d44, nonce 10.
const batchData =
  '0x8d80ff0a0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000017200e217abf1077ec4772e4e78ca0802046a974cba90000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000648745e1c00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000a166dba4b8a3d5f3ff9257c2e4cbd6080092d4ba061336c223f774a23f9a385b7eadfa64a6000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000648745e1c00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000a166dba4b8a3d5f3ff9257c2e4cbd6080000000000000000000000000000'
const addSwapHandlers = new Interface(['function addSwapHandlers(address[])']).encodeFunctionData(
  'addSwapHandlers',
  [['0x00000000a166dbA4B8A3d5F3ff9257c2E4cbD608']]
)

it('splits an official MultiSend delegatecall into its calls', () => {
  expect(unpackMultiSend({ to: multiSendCallOnly, operation: 1, data: batchData })).toEqual([
    { operation: 0, to: '0xE217abF1077eC4772E4E78Ca0802046A974cba90', value: '0', data: addSwapHandlers },
    { operation: 0, to: '0x92d4Ba061336C223f774A23f9a385B7eAdFA64A6', value: '0', data: addSwapHandlers }
  ])
})

it('leaves calls, unknown targets and malformed packing unsplit', () => {
  expect(unpackMultiSend({ to: multiSendCallOnly, operation: 0, data: batchData })).toBeUndefined()
  expect(
    unpackMultiSend({ to: '0x0000000000000000000000000000000000001234', operation: 1, data: batchData })
  ).toBeUndefined()
  expect(
    unpackMultiSend({ to: multiSendCallOnly, operation: 1, data: batchData.slice(0, -128) })
  ).toBeUndefined()
})

it('treats an unbatched proposal as its single action', () => {
  const proposal: SafeProposal = {
    safeTxHash: `0x${'a'.repeat(64)}`,
    safe: '0x4d8D99be16a38D5809f3A9BcDc221c45a56A6d44',
    nonce: '9',
    to: '0x78d2567ddD44A959A9BBfb8c9E9dBA4C2f628010',
    value: '0',
    operation: 0,
    data: '0x3659cfe6',
    confirmations: [],
    localDecoded: { method: 'upgradeTo', parameters: [], source: 'Local function selector' }
  }
  expect(safeProposalActions(proposal)).toEqual([
    {
      operation: 0,
      to: proposal.to,
      value: '0',
      data: '0x3659cfe6',
      decoded: { method: 'upgradeTo', parameters: [], source: 'Local function selector' }
    }
  ])
})

it('links to the proposal in the Safe web app with its chain prefix', () => {
  const safe = '0x4d8D99be16a38D5809f3A9BcDc221c45a56A6d44'
  const hash = `0x${'a'.repeat(64)}`
  expect(safeAppTransactionUrl(56, safe, hash)).toBe(
    `https://app.safe.global/transactions/tx?safe=bnb%3A${safe}&id=multisig_${safe}_${hash}`
  )
  expect(safeAppTransactionUrl(999, safe, hash)).toStartWith(
    'https://app.safe.global/transactions/tx?safe=hyper-evm%3A'
  )
  expect(safeAppTransactionUrl(232, safe, hash)).toBeUndefined()
  expect(safeAppTransactionUrl(31337, safe, hash)).toBeUndefined()
})
