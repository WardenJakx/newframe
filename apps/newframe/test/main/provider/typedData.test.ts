import { describe, expect, it } from 'bun:test'
import { SignTypedDataVersion } from '@metamask/eth-sig-util'

import { getVersionFromTypedData } from '../../../main/provider/typedData'

describe('#getVersionFromTypedData', () => {
  const typedData = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' }
      ],
      Person: [
        { name: 'name', type: 'string' },
        { name: 'wallet', type: 'address' }
      ],
      Mail: [
        { name: 'from', type: 'Person' },
        { name: 'to', type: 'Person' },
        { name: 'contents', type: 'string' }
      ]
    },
    domain: 'domainData',
    primaryType: 'Mail',
    message: {
      from: {
        name: 'Cow',
        wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826'
      },
      to: {
        name: 'Bob',
        wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB'
      },
      contents: 'Hello!'
    }
  }
  const typedDataLegacy = [
    {
      type: 'string',
      name: 'fullName',
      value: 'Satoshi Nakamoto'
    },
    {
      type: 'uint32',
      name: 'userId',
      value: '1212'
    }
  ]
  const typedDataRecursive = {
    ...typedData,
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' }
      ],
      Person: [
        { name: 'name', type: 'string' },
        { name: 'mother', type: 'Person' },
        { name: 'father', type: 'Person' }
      ]
    },
    primaryType: 'Person',
    message: {
      name: 'Satoshi Nakamoto',
      mother: {
        name: 'unknown'
      },
      father: {
        name: 'unknown'
      }
    }
  }
  const typedDataArrays = {
    ...typedData,
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' }
      ],
      Person: [
        { name: 'name', type: 'string' },
        { name: 'wallet', type: 'address' }
      ],
      Mail: [
        { name: 'from', type: 'Person' },
        { name: 'to', type: 'Person' },
        { name: 'contents', type: 'string' }
      ],
      Group: [
        { name: 'name', type: 'string' },
        { name: 'members', type: 'Person[]' }
      ]
    }
  }
  const typedDataArraysInvalid = {
    ...typedDataArrays,
    primaryType: 'b0rk'
  }
  const typedDataNullCustomType = {
    ...typedData,
    message: {
      to: null,
      from: {
        name: 'Cow',
        wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826'
      },
      contents: 'Hello, Bob!'
    }
  }
  const typedDataUndefinedProperty = {
    ...typedData,
    message: {
      from: {
        name: 'Cow',
        wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826'
      },
      to: {
        name: 'Bob',
        wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB'
      },
      contents: undefined
    }
  }
  const typedDataInvalid = {
    ...typedData,
    primaryType: 'b0rk'
  }

  const validRequests = [
    { data: typedDataLegacy, version: SignTypedDataVersion.V1, dataDescription: 'legacy' },
    { data: typedData, version: SignTypedDataVersion.V4, dataDescription: 'eip-712' },
    { data: typedDataInvalid, version: SignTypedDataVersion.V4, dataDescription: 'eip-712 invalid' },
    { data: typedDataRecursive, version: SignTypedDataVersion.V4, dataDescription: 'eip-712 with recursion' }, // supported by both v3 and v4
    { data: typedDataArrays, version: SignTypedDataVersion.V4, dataDescription: 'eip-712 with arrays' }, // unsupported by v3
    {
      data: typedDataArraysInvalid,
      version: SignTypedDataVersion.V4,
      dataDescription: 'eip-712 invalid with arrays'
    },
    {
      data: typedDataNullCustomType,
      version: SignTypedDataVersion.V4,
      dataDescription: 'eip-712 with null custom type'
    }, // unsupported by v3
    {
      data: typedDataUndefinedProperty,
      version: SignTypedDataVersion.V3,
      dataDescription: 'eip-712 with undefined property'
    } // unsupported by v4
  ]

  validRequests.forEach(({ data, version, dataDescription }) => {
    it(`returns ${version} when parsing ${dataDescription} data`, () => {
      expect(getVersionFromTypedData(data as any)).toBe(version)
    })
  })
})
