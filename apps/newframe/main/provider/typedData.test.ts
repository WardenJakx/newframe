import { describe, expect, it } from 'bun:test'
import { SignTypedDataVersion } from '@metamask/eth-sig-util'

import { getVersionFromTypedData } from './typedData'

describe('#getVersionFromTypedData', () => {
  const typedData: any = {
    types: {
      EIP712Domain: [],
      Mail: [{ name: 'contents', type: 'string' }]
    },
    domain: {},
    primaryType: 'Mail',
    message: { contents: 'Hello!' }
  }
  const typedDataWithArrays = {
    ...typedData,
    types: {
      ...typedData.types,
      Group: [{ name: 'members', type: 'Person[]' }]
    }
  }

  ;[
    [
      'legacy arrays',
      [{ type: 'string', name: 'fullName', value: 'Satoshi Nakamoto' }],
      SignTypedDataVersion.V1
    ],
    ['ordinary EIP-712 data', typedData, SignTypedDataVersion.V4],
    ['EIP-712 arrays', typedDataWithArrays, SignTypedDataVersion.V4],
    ['undefined properties', { ...typedData, message: {} }, SignTypedDataVersion.V3],
    ['malformed EIP-712 data', { ...typedData, primaryType: 'missing' }, SignTypedDataVersion.V4]
  ].forEach(([description, data, version]) => {
    it(`returns ${version} for ${description}`, () => {
      expect(getVersionFromTypedData(data as any)).toBe(version)
    })
  })
})
