import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'

import { commandOutputCollector, stopProcess } from './process.ts'
import type { HarnessService } from './service.ts'
import { tail } from './utils.ts'

export type ProcessServiceOptions = {
  name: string
  command: string
  args: string[]
  spawn: SpawnOptions
  beforeStart?: () => Promise<void>
  ready?: (child: ChildProcess) => Promise<void>
  exitIsFailure?: boolean
}

export type ProcessHandle = {
  child: ChildProcess
  output: () => string
  exited: Promise<number>
}

export class ProcessService implements HarnessService<ProcessHandle> {
  readonly name: string
  failure?: Promise<never>

  private child?: ChildProcess
  private handle?: ProcessHandle
  private readonly options: ProcessServiceOptions
  private stopping = false

  constructor(options: ProcessServiceOptions) {
    this.options = options
    this.name = options.name
  }

  async start() {
    if (this.handle) return this.handle

    await this.options.beforeStart?.()

    const child = spawn(this.options.command, this.options.args, this.options.spawn)
    this.child = child
    const output = commandOutputCollector(child)
    const exited = new Promise<number>((resolve, reject) => {
      child.once('error', (err) =>
        reject(new Error(`${this.name} failed to start: ${err.message}`, { cause: err }))
      )
      child.once('exit', (code, signal) => {
        if (signal) reject(new Error(`${this.name} exited with ${signal}`))
        else resolve(code ?? 0)
      })
    })
    exited.catch(() => undefined)

    this.failure = new Promise<never>((_, reject) => {
      child.once('error', (err) => reject(new Error(`${this.name} failed: ${err.message}`, { cause: err })))
      child.once('exit', (code, signal) => {
        if (this.stopping || this.options.exitIsFailure === false) return
        reject(
          new Error(
            `${this.name} exited unexpectedly with ${signal || `code ${code ?? 'unknown'}`}${
              output() ? `\n\n${tail(output())}` : ''
            }`
          )
        )
      })
    })
    this.failure.catch(() => undefined)
    this.handle = { child, output, exited }

    if (this.options.ready) await Promise.race([this.options.ready(child), this.failure])

    return this.handle
  }

  async stop() {
    this.stopping = true
    await stopProcess(this.child)
  }
}

export async function expectSuccessfulExit(handle: ProcessHandle, label: string) {
  const code = await handle.exited
  if (code !== 0) {
    throw new Error(
      `${label} exited with code ${code}${handle.output() ? `\n\n${tail(handle.output())}` : ''}`
    )
  }
}
