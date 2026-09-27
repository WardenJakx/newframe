import { expect, it } from 'bun:test'

import { queueTokenMetadata } from './metadataQueue'

it('deduplicates token metadata work and limits starts and concurrency', async () => {
  const provider = {}
  const started: string[] = []
  const release: Array<() => void> = []
  const enqueue = (key: string) =>
    queueTokenMetadata(provider, key, () => {
      started.push(key)
      return new Promise<void>((resolve) => release.push(resolve))
    })

  const first = enqueue('first')
  const duplicate = enqueue('first')
  const second = enqueue('second')
  const third = enqueue('third')
  expect(duplicate).toBe(first)

  await new Promise((resolve) => setTimeout(resolve, 150))
  expect(started).toEqual(['first', 'second'])
  release[0]()
  await new Promise((resolve) => setTimeout(resolve, 110))
  expect(started).toEqual(['first', 'second', 'third'])
  release[1]()
  release[2]()
  await Promise.all([first, second, third])
})
