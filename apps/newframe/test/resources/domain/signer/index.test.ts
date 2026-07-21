import { describe, expect, it } from 'bun:test'

import { isHardwareSigner } from '../../../../resources/domain/signer'

describe('#isHardwareSigner', () => {
  const hardwareSigners = ['lattice', 'trezor', 'ledger']

  hardwareSigners.forEach((signerType) => {
    it(`considers a string type of ${signerType} to be a hardware signer`, () => {
      expect(isHardwareSigner(signerType)).toBe(true)
    })
  })

  it('determines the hardware type of a signer object', () => {
    const signer = { type: 'ledger' }
    expect(isHardwareSigner(signer as any)).toBe(true)
  })

  it('handles signer types regardless of case', () => {
    expect(isHardwareSigner('tReZoR')).toBe(true)
  })

  it('does not consider an unexpected type to be a hardware signer', () => {
    expect(isHardwareSigner('seed')).toBe(false)
  })
})
