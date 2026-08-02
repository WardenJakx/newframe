import { expect, it } from 'bun:test'

import { Derivation, getDerivationPath } from './derive'

it('builds every supported indexed and base derivation path', () => {
  const cases: Array<[Derivation, number | undefined, string]> = [
    [Derivation.legacy, undefined, "44'/60'/0'/"],
    [Derivation.legacy, 0, "44'/60'/0'/0"],
    [Derivation.legacy, 3, "44'/60'/0'/3"],
    [Derivation.standard, undefined, "44'/60'/0'/0/"],
    [Derivation.standard, 0, "44'/60'/0'/0/0"],
    [Derivation.standard, 14, "44'/60'/0'/0/14"],
    [Derivation.testnet, undefined, "44'/1'/0'/0/"],
    [Derivation.testnet, 0, "44'/1'/0'/0/0"],
    [Derivation.testnet, 9, "44'/1'/0'/0/9"],
    [Derivation.live, undefined, "44'/60'/'/0/0"],
    [Derivation.live, 0, "44'/60'/0'/0/0"],
    [Derivation.live, 24, "44'/60'/24'/0/0"]
  ]
  for (const [derivation, index, expected] of cases) {
    expect(getDerivationPath(derivation, index)).toBe(expected)
  }
})
