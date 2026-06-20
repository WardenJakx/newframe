import { Interface, encodeBytes32String } from 'ethers'

import ensContracts from '../../../../../main/contracts/deployments/ens'

const from = '0x6fBdDB7200c95f8f648C7bF6E99606CB8AdfF6F9'
const to = '0x388C818CA8B9251b393131C08a736A67ccB19297'
const tokenId = '79233663829379634837589865448569342784712482819484549289560981379859480642508'

describe('registrar', () => {
  const registrar: any = ensContracts.find((c) => c.name.toLowerCase().includes('permanent registrar'))

  const registrarInterface = new Interface([
    'function transferFrom(address from, address to, uint256 tokenId)',
    'function safeTransferFrom(address from, address to, uint256 tokenId)',
    'function approve(address to, uint256 tokenId)'
  ])

  describe('transfers', () => {
    const supportedFunctions = ['transferFrom', 'safeTransferFrom']

    supportedFunctions.forEach((fn) => {
      it(`recognizes a call to ${fn} for a name with an unknown token id`, () => {
        const calldata = registrarInterface.encodeFunctionData(fn, [from, to, BigInt(tokenId)])
        const action = registrar.decode(calldata)

        expect(action).toStrictEqual({
          id: 'ens:transfer',
          data: { name: '', from, to, tokenId }
        })
      })

    })
  })

  describe('approvals', () => {
    it('recognizes a call to approve for a name with an unknown token id', () => {
      const calldata = registrarInterface.encodeFunctionData('approve', [to, BigInt(tokenId)])
      const action = registrar.decode(calldata)

      expect(action).toStrictEqual({
        id: 'ens:approve',
        data: { name: '', operator: to, tokenId }
      })
    })

  })
})

describe('registrar controller', () => {
  const registrarController: any = ensContracts.find((c) => c.name.toLowerCase().includes('controller'))

  const registrarControllerInterface = new Interface([
    'function commit(bytes32 commitment)',
    'function register(string name, address owner, uint256 duration, bytes32 secret) payable',
    'function registerWithConfig(string name, address owner, uint256 duration, bytes32 secret, address resolver, address addr) payable',
    'function renew(string name, uint256 duration) payable'
  ])

  it('recognizes a call for a pre-commitment to registering an ENS name', () => {
    const calldata = registrarControllerInterface.encodeFunctionData('commit', [
      encodeBytes32String('asecretphrase')
    ])
    const action = registrarController.decode(calldata)

    expect(action).toStrictEqual({
      id: 'ens:commit'
    })
  })

  describe('registrations', () => {
    const supportedFunctions = ['register', 'registerWithConfig']

    supportedFunctions.forEach((fn) => {
      it(`recognizes a call to ${fn} in order to register an ENS name`, () => {
        const duration = 60 * 60 * 24 * 365 // 1 year, in seconds

        const functionParams = ['frame.eth', to, duration, encodeBytes32String('asecretphrase')].concat(
          fn.toLowerCase().includes('config') ? [from, from] : []
        )
        const calldata = registrarControllerInterface.encodeFunctionData(fn, functionParams)
        const action = registrarController.decode(calldata)

        expect(action).toStrictEqual({
          id: 'ens:register',
          data: { name: 'frame.eth', address: to, duration }
        })
      })
    })

    it('adds a .eth extension to a name to be registered', () => {
      const calldata = registrarControllerInterface.encodeFunctionData('register', [
        'frame',
        to,
        31536000,
        encodeBytes32String('asecretphrase')
      ])
      const action = registrarController.decode(calldata)

      expect(action.data.name).toBe('frame.eth')
    })
  })

  it('recognizes a call to renew an ENS name', () => {
    const duration = 60 * 60 * 24 * 30 * 18 // 18 months, in seconds
    const calldata = registrarControllerInterface.encodeFunctionData('renew', ['frame.eth', duration])
    const action = registrarController.decode(calldata)

    expect(action).toStrictEqual({
      id: 'ens:renew',
      data: { name: 'frame.eth', duration }
    })
  })
})
