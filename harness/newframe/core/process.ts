import type { ChildProcess, SpawnOptions } from 'node:child_process'

import { rootDir } from './config.ts'
import { killProcessGroup, spawnProcessGroup } from './reaper.ts'
import { sleep, tail } from './utils.ts'

export type RunningCommand = {
  child: ChildProcess
  label: string
  output: () => string
  promise: Promise<void>
}

export function commandOutputCollector(child: ChildProcess) {
  let output = ''
  const append = (chunk: Buffer) => {
    output = tail(output + chunk.toString(), 20_000)
  }

  child.stdout?.on('data', append)
  child.stderr?.on('data', append)

  return () => output
}

export function startCommand(
  label: string,
  command: string,
  args: string[],
  cwd: string,
  options: Omit<SpawnOptions, 'cwd'> = {}
): RunningCommand {
  const child = spawnProcessGroup(command, args, {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
    cwd
  })
  const output = commandOutputCollector(child)

  const running: RunningCommand = {
    child,
    label,
    output,
    promise: new Promise<void>((resolve, reject) => {
      child.once('error', (err) => {
        reject(new Error(`${label} failed to start: ${err.message}`, { cause: err }))
      })
      child.once('exit', (code, signal) => {
        if (code === 0) {
          resolve()
        } else {
          reject(
            new Error(
              `${label} exited with ${signal ?? `code ${code ?? 'unknown'}`}${
                output() ? `\n\n${tail(output())}` : ''
              }`
            )
          )
        }
      })
    })
  }

  running.promise.catch(() => undefined)
  return running
}

export async function runCommand(label: string, command: string, args: string[], cwd: string) {
  await startCommand(label, command, args, cwd).promise
}

export async function ensureCommand(command: string, args = ['--version']) {
  await startCommand(`check ${command}`, command, args, rootDir).promise.catch((err: unknown) => {
    const cause = err instanceof Error ? err : new Error(String(err))
    throw new Error(`Required command is missing or not runnable: ${command}\n${cause.message}`)
  })
}

/** Signals the child's whole process group, escalating to SIGKILL if it has not exited in 5 seconds. */
export async function stopProcess(child: ChildProcess | undefined, signal: NodeJS.Signals = 'SIGTERM') {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) {
    return
  }

  const exited = new Promise((resolve) => child.once('exit', resolve))
  killProcessGroup(child.pid, signal)
  await Promise.race([exited, sleep(5_000)])
  killProcessGroup(child.pid, 'SIGKILL')
  await exited
}
