export {}

// Short-term compatibility shim while tests still use Jest-style globals on Bun's runner.
// `@types/bun` covers the `bun:test` module, but it does not expose every global/type
// surface our existing tests use, including `jest.mock`, `jest.requireActual`, and Jest's
// looser matcher signatures. Long term, remove this file by converting tests to import
// from `bun:test`, replacing `jest.mock` with `mock.module`, avoiding `jest.requireActual`,
// and tightening assertions to Bun's matcher types.

type BunExpect = typeof import('bun:test').expect
type BunJest = typeof import('bun:test').jest
type BunMockModule = typeof import('bun:test').mock.module

declare global {
  var test: typeof import('bun:test').test
  var it: typeof import('bun:test').it
  var describe: typeof import('bun:test').describe
  var expect: BunExpect
  var beforeAll: typeof import('bun:test').beforeAll
  var beforeEach: typeof import('bun:test').beforeEach
  var afterEach: typeof import('bun:test').afterEach
  var afterAll: typeof import('bun:test').afterAll
  var jest: BunJest & {
    mock: BunMockModule
    requireActual<T = any>(moduleName: string): T
  }
  var xit: typeof import('bun:test').xit
  var xtest: typeof import('bun:test').xtest
  var xdescribe: typeof import('bun:test').xdescribe
}

declare module 'bun:test' {
  interface Matchers<T = unknown> {
    toBe(expected: any | T): void
    toEqual(expected: any | T): void
    toStrictEqual(expected: any | T): void
    toContainEqual(expected: any | T): void
  }
}
