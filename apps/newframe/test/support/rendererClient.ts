import { afterEach, beforeEach, mock } from 'bun:test'

import type { NewframeHost } from '../../src/platform/ipc/contract/ipc'
import type { AppCommand, AppQuery, CommandResult, ResultForQuery } from '../../src/app/contracts/operations'
import type { StateConnectionResult, StateMessage } from '../../src/platform/state-sync/contract/protocol'
import type { RendererStateFixtureOptions } from './rendererState'
import { createRendererStateFixture, installRendererStateFixture } from './rendererState'

export function createRendererClient() {
  return {
    connectState: mock(
      async (_handler: (message: StateMessage) => void): Promise<StateConnectionResult> => ({
        ok: true
      })
    ),
    disconnectState: mock(async (): Promise<StateConnectionResult> => ({ ok: true })),
    executeCommand: mock(
      async <TCommand extends AppCommand>(_command: TCommand): Promise<CommandResult> => ({ ok: true })
    ),
    executeQuery: mock(
      async <TQuery extends AppQuery>(_query: TQuery): Promise<ResultForQuery<TQuery>> =>
        ({ ok: false, error: 'not_found' }) as ResultForQuery<TQuery>
    )
  } satisfies NewframeHost
}

type TestRendererClient = ReturnType<typeof createRendererClient>

interface HostInstallationBase {
  createdWindow: boolean
  previousHost: NewframeHost | undefined
}

interface HostInstallation {
  base: HostInstallationBase
  client: TestRendererClient
  disposed: boolean
  previous: HostInstallation | undefined
  window: Window
}

const activeHostInstallations = new WeakMap<Window, HostInstallation>()

export function createTestRuntimeFixture(options?: RendererStateFixtureOptions) {
  return {
    client: createRendererClient(),
    state: createRendererStateFixture(options)
  }
}

export type TestRuntimeFixture = ReturnType<typeof createTestRuntimeFixture>

export function registerTestRuntimeFixture(options?: RendererStateFixtureOptions): TestRuntimeFixture {
  let runtime: TestRuntimeFixture | undefined
  let disposeHost: (() => void) | undefined
  let disposeState: (() => void) | undefined

  beforeEach(() => {
    runtime = createTestRuntimeFixture(options)
    disposeHost = installRendererHost(runtime.client)
    disposeState = installRendererStateFixture(runtime.state)
  })

  afterEach(() => {
    disposeHost?.()
    disposeState?.()
    disposeHost = undefined
    disposeState = undefined
    runtime = undefined
  })

  const current = () => {
    if (!runtime) throw new Error('Renderer runtime fixture is only available during a test.')
    return runtime
  }

  return {
    get client() {
      return current().client
    },
    get state() {
      return current().state
    }
  }
}

export function installRendererHost(client: TestRendererClient) {
  const createdWindow = typeof window === 'undefined'

  if (createdWindow) {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {}
    })
  }

  const installedWindow = window
  const activeInstallation = activeHostInstallations.get(installedWindow)
  const previous =
    activeInstallation &&
    !activeInstallation.disposed &&
    installedWindow.__NEWFRAME_HOST__ === activeInstallation.client
      ? activeInstallation
      : undefined
  const installation: HostInstallation = {
    base: previous?.base ?? {
      createdWindow,
      previousHost: installedWindow.__NEWFRAME_HOST__
    },
    client,
    disposed: false,
    previous,
    window: installedWindow
  }

  activeHostInstallations.set(installedWindow, installation)
  installedWindow.__NEWFRAME_HOST__ = client

  return () => {
    if (installation.disposed) return
    installation.disposed = true

    if (activeHostInstallations.get(installedWindow) !== installation) return
    if (installedWindow.__NEWFRAME_HOST__ !== client) {
      activeHostInstallations.delete(installedWindow)
      return
    }

    let previousInstallation = installation.previous
    while (previousInstallation?.disposed) previousInstallation = previousInstallation.previous

    if (previousInstallation) {
      activeHostInstallations.set(installedWindow, previousInstallation)
      installedWindow.__NEWFRAME_HOST__ = previousInstallation.client
      return
    }

    activeHostInstallations.delete(installedWindow)
    if (installation.base.createdWindow) {
      if (globalThis.window === installedWindow) Reflect.deleteProperty(globalThis, 'window')
    } else if (installation.base.previousHost) {
      installedWindow.__NEWFRAME_HOST__ = installation.base.previousHost
    } else {
      Reflect.deleteProperty(installedWindow, '__NEWFRAME_HOST__')
    }
  }
}
