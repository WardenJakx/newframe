import log from 'electron-log'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, mock, spyOn } from 'bun:test'

import checkForUpdates from '../../../main/updater/manualCheck'
import packageInfo from '../../../package.json'

// response for current release
const githubReleasesResponse = [
  {
    html_url: 'https://newframe.sh/the-next-great-release',
    prerelease: false,
    tag_name: packageInfo.version
  }
]

const currentVersion = packageInfo.version
const nextVersion =
  currentVersion.slice(0, currentVersion.length - 1) +
  (parseInt(currentVersion[currentVersion.length - 1]) + 1)

beforeAll(() => {
  log.transports.console.level = false
  log.transports.file.level = false
})

afterAll(() => {
  log.transports.console.level = 'debug'
  log.transports.file.level = 'info'
})

beforeEach(() => {
  spyOn(globalThis, 'fetch').mockImplementation((() =>
    Promise.reject(new Error('Unexpected fetch'))) as unknown as typeof fetch)
})

afterEach(() => {
  mock.restore()
})

it('identifies that a newer version is not available', async () => {
  const fetchMock = mockApiResponse(200, githubReleasesResponse)

  await expect(checkForUpdates()).resolves.toBeFalsy()
  expect(fetchMock).toHaveBeenCalledWith('https://api.github.com/repos/wardenjakx/newframe/releases', {
    headers: { 'User-Agent': 'request' }
  })
})

it('identifies that a newer version is available', async () => {
  const response = [
    {
      html_url: 'https://newframe.sh/cutting-edge-frame-release',
      prerelease: true,
      tag_name: `v${nextVersion}`
    },
    ...githubReleasesResponse
  ]

  mockApiResponse(200, response)

  const res = await checkForUpdates({ prereleaseTrack: true })

  expect(res?.version).toBe(`v${nextVersion}`)
  expect(res?.location).toBe('https://newframe.sh/cutting-edge-frame-release')
})

it('ignores a release on the prerelease track', () => {
  const response = [
    {
      html_url: 'https://newframe.sh/cutting-edge-frame-release',
      prerelease: true,
      tag_name: `v${nextVersion}`
    },
    ...githubReleasesResponse
  ]

  mockApiResponse(200, response)

  return expect(checkForUpdates({ prereleaseTrack: false })).resolves.toBeFalsy()
})

it('handles an HTTP status error', async () => {
  mockApiResponse(403, '{"message":"API rate limit exceeded"}')

  return expect(checkForUpdates()).rejects.toBeDefined()
})

it('handles a non-JSON response', async () => {
  mockApiResponse(200, '', { 'content-type': 'text/html' })

  return expect(checkForUpdates()).rejects.toBeDefined()
})

it('handles an error parsing the JSON response', async () => {
  mockApiResponse(200, 'test')

  return expect(checkForUpdates()).rejects.toBeDefined()
})

function mockApiResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = { 'content-type': 'application/json' }
) {
  return spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers })
  )
}
