import { expect } from '@jest/globals'
import path from 'path'

declare global {
  namespace jest {
    interface Matchers<R> {
      toMatchPath(expected: string): R
    }
    interface Expect {
      toMatchPath(expected: string): any
    }
    interface InverseAsymmetricMatchers {
      toMatchPath(expected: string): any
    }
  }
}

const normalizePath = (value: string) => {
  return path
    .normalize(value || '')
    .split('\\')
    .join('/')
}

const toMatchPath = (actual: string, expected: string) => {
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
