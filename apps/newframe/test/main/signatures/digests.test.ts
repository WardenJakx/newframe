import { SignTypedDataVersion } from '@metamask/eth-sig-util'
import { TypedDataEncoder } from 'ethers'

import { getCalldataDigest, getEip712Digests } from '../../../main/signatures/digests'

const TYPED_DATA = {
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
  primaryType: 'Mail',
  domain: {
    name: 'Ether Mail',
    version: '1',
    chainId: 1,
    verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC'
  },
  message: {
    from: {
      name: 'Cow',
      wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826'
    },
    to: {
      name: 'Bob',
      wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB'
    },
    contents: 'Hello, Bob!'
  }
}

const TYPED_TYPES = {
  Person: TYPED_DATA.types.Person,
  Mail: TYPED_DATA.types.Mail
}

describe('ERC-8213 digests', () => {
  test('computes calldata digest with a uint256 length prefix', () => {
    const calldata =
      '0xa9059cbb' +
      '0000000000000000000000004675c7e5baafbffbca748158becba61ef3b0a263' +
      '0000000000000000000000000000000000000000000000000de0b6b3a7640000'

    expect(getCalldataDigest(calldata)).toBe(
      '0x812cee5d9cc7461c04bbcd7b70af9c28b243ac5d74d3453b008b93b7dac69985'
    )
  })

  test('computes 0x-prefixed EIP-712 digest display values', () => {
    const digests = getEip712Digests({
      data: TYPED_DATA,
      version: SignTypedDataVersion.V4
    })

    expect(digests?.eip712Digest).toBe(TypedDataEncoder.hash(TYPED_DATA.domain, TYPED_TYPES, TYPED_DATA.message))
    expect(digests?.domainHash).toMatch(/^0x[0-9a-f]{64}$/)
    expect(digests?.messageHash).toMatch(/^0x[0-9a-f]{64}$/)
  })
})
