import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'

import { rootDir } from './config.ts'
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
  const child = spawn(command, args, {
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
              `${label} exited with ${signal || `code ${code ?? 'unknown'}`}${
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
  await startCommand(`check ${command}`, command, args, rootDir).promise.catch((err: Error) => {
    throw new Error(`Required command is missing or not runnable: ${command}\n${err.message}`)
  })
}

export async function stopProcess(child: ChildProcess | undefined, signal: NodeJS.Signals = 'SIGTERM') {
  if (!child || child.killed || child.exitCode !== null) return

  child.kill(signal)

  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(5_000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    })
  ])
}
