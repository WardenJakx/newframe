import { expect } from 'bun:test'
import path from 'path'

declare module 'bun:test' {
  interface Matchers<T = unknown> {
    toMatchPath(expected: string | (T & never)): void
  }

  interface AsymmetricMatchers {
    toMatchPath(expected: string): void
  }
}

const normalizePath = (value: unknown) => {
  return path
    .normalize(String(value || ''))
    .split('\\')
    .join('/')
}

const toMatchPath = (actual: unknown, expected: unknown) => {
  return normalizePath(actual) === normalizePath(expected)
    ? {
        pass: true,
        message: () => `expected ${normalizePath(actual)} to be ${normalizePath(expected)}`
      }
    : {
        pass: false,
        message: () => `expected ${normalizePath(actual)} to be ${normalizePath(expected)}`
      }
}

expect.extend({
  toMatchPath
})
