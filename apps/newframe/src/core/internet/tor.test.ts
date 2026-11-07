import { afterEach, expect, it, mock } from 'bun:test'
import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'

import { electronMock } from '../../../test/support/electron.mock.ts'
import { routeInternet, startTor } from './tor.ts'

type Launcher = NonNullable<Parameters<typeof startTor>[1]>
const directories: string[] = []
const spawn = mock()
// routeInternet launches the bundled Tor it finds on disk.
await mock.module('node:child_process', () => ({ spawn }))
await mock.module('node:fs', () => ({ ...fs, existsSync: () => true }))

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function tempDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'newframe-tor-test-'))
  directories.push(directory)
  return directory
}

function torProcess() {
  const child = Object.assign(new EventEmitter(), {
    pid: 1234,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: mock((signal: NodeJS.Signals) => {
      child.signalCode = signal
      queueMicrotask(() => child.emit('exit', null, signal))
      return true
    })
  })
  return child
}

async function launchTor(bootstrapTimeoutMs = 1_000) {
  const directory = await tempDirectory()
  const child = torProcess()
  const launched = Promise.withResolvers<void>()
  const launch = mock<Launcher>(() => {
    launched.resolve()
    return child as unknown as ReturnType<Launcher>
  })
  const onExit = mock()
  const tor = startTor(
    { bundle: directory, dataDirectory: join(directory, 'state'), bootstrapTimeoutMs, onExit },
    launch
  )
  await launched.promise
  return { child, tor, launch, onExit }
}

it('is ready only once Tor has bootstrapped and opened its SOCKS listener', async () => {
  const { child, tor, launch } = await launchTor()
  let ready = false
  void tor.ready.then(() => (ready = true))

  child.stdout.write('[notice] Bootstrapped 100% (done): Done\n')
  await Bun.sleep(0)
  expect(ready).toBe(false)
  child.stdout.write('[notice] Opened Socks listener connection (ready) on 127.0.0.1:43123\n')

  expect(await tor.ready).toBe(43123)
  expect(launch.mock.calls[0][1]).toContain('--ClientRejectInternalAddresses')
  await tor.stop()
})

it('rejects when Tor exits or stalls before it is ready', async () => {
  const exited = await launchTor()
  exited.child.emit('exit', 1, null)
  expect(await exited.tor.ready.catch((error: unknown) => error)).toEqual(new Error('Tor exited (1)'))

  const stalled = await launchTor(15)
  expect(await stalled.tor.ready.catch((error: unknown) => error)).toEqual(
    new Error('Tor bootstrap timed out')
  )
  expect(stalled.child.kill).toHaveBeenCalledWith('SIGTERM')
})

it('reports an unexpected exit after it was ready, but not a requested stop', async () => {
  const crashed = await launchTor()
  crashed.child.stdout.write('Opened Socks listener connection (ready) on 127.0.0.1:1\nBootstrapped 100%\n')
  await crashed.tor.ready
  crashed.child.emit('exit', 2, null)
  expect(crashed.onExit.mock.calls).toEqual([[new Error('Tor exited (2)')]])

  const stopped = await launchTor()
  stopped.child.stdout.write('Opened Socks listener connection (ready) on 127.0.0.1:1\nBootstrapped 100%\n')
  await stopped.tor.ready
  await Promise.all([stopped.tor.stop(), stopped.tor.stop()])
  expect(stopped.child.kill).toHaveBeenCalledTimes(1)
  expect(stopped.onExit).not.toHaveBeenCalled()
})

it('keeps traffic closed when Tor exits while its proxy is being set', async () => {
  const child = torProcess()
  spawn.mockReturnValue(child)
  electronMock.app.getPath.mockReturnValueOnce(await tempDirectory())
  const proxyRequested = Promise.withResolvers<void>()
  const proxySet = Promise.withResolvers<void>()
  electronMock.session.defaultSession.setProxy.mockImplementationOnce(() => {
    proxyRequested.resolve()
    return proxySet.promise
  })
  const internet = { setRoute: mock() }
  const setStatus = mock()

  routeInternet(internet, true, setStatus)
  child.stdout.write('Opened Socks listener connection (ready) on 127.0.0.1:1\nBootstrapped 100%\n')
  await proxyRequested.promise
  child.emit('exit', 2, null)
  proxySet.resolve()
  await Bun.sleep(0)

  expect(internet.setRoute).toHaveBeenLastCalledWith({ via: 'tor', socksPort: null })
  expect(setStatus).toHaveBeenLastCalledWith({ available: true, connection: 'error' })
})
