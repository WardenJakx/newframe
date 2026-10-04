import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { rmSync } from 'node:fs'
import type { Socket } from 'node:net'

// Every harness child leads its own process group, so stopping it also stops its descendants
// (bun → tsc, Electron → helpers). Groups and temporary paths are released by the owning service,
// then by a synchronous `exit` hook, and finally by a detached reaper that outlives the harness
// even when it is SIGKILLed: the reaper's stdin closes however the harness dies.

type ReaperMessage = { op: 'add' | 'delete'; group: number } | { op: 'add' | 'delete'; path: string }

const reaperSource = `
const { rmSync } = require('node:fs')
const groups = new Set()
const paths = new Set()
let buffered = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  const lines = (buffered + chunk).split('\\n')
  buffered = lines.pop()
  for (const line of lines) {
    const message = JSON.parse(line)
    if ('group' in message) groups[message.op](message.group)
    else paths[message.op](message.path)
  }
})
process.stdin.on('end', () => {
  for (const group of groups) {
    try { process.kill(-group, 'SIGKILL') } catch {}
  }
  for (const path of paths) rmSync(path, { recursive: true, force: true })
  process.exit(0)
})
`

const groups = new Set<number>()
const paths = new Set<string>()
let reaper: ChildProcess | undefined

function send(message: ReaperMessage) {
  if (!reaper) {
    reaper = spawn(process.execPath, ['-e', reaperSource], {
      detached: true,
      stdio: ['pipe', 'ignore', 'ignore']
    })
    reaper.unref()
    reaper.stdin!.on('error', () => undefined)
    // Node's pipe would otherwise keep the harness alive; Bun's has no unref and does not.
    ;(reaper.stdin as Partial<Socket>).unref?.()
    process.once('exit', releaseAll)
  }
  reaper.stdin!.write(`${JSON.stringify(message)}\n`)
}

function releaseAll() {
  for (const group of groups) {
    killProcessGroup(group, 'SIGKILL')
  }
  for (const path of paths) {
    rmSync(path, { recursive: true, force: true })
  }
}

export function killProcessGroup(group: number, signal: NodeJS.Signals) {
  try {
    process.kill(-group, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      throw error
    }
  }
}

/** Kills the child's whole process group when it exits, and with the harness however that exits. */
export function trackProcessGroup(child: ChildProcess) {
  const group = child.pid
  if (group === undefined || child.exitCode !== null || child.signalCode !== null) {
    return
  }

  groups.add(group)
  send({ op: 'add', group })
  child.once('exit', () => {
    // A finished leader can leave descendants behind; nothing in its group may outlive it.
    killProcessGroup(group, 'SIGKILL')
    groups.delete(group)
    send({ op: 'delete', group })
  })
}

export function spawnProcessGroup(command: string, args: string[], options: SpawnOptions) {
  const child = spawn(command, args, {
    ...options,
    detached: true,
    // A background process group that reads the terminal would be stopped by SIGTTIN.
    stdio: options.stdio === 'inherit' ? ['ignore', 'inherit', 'inherit'] : options.stdio
  })
  trackProcessGroup(child)
  return child
}

/** Removes the path with the harness however that exits; call the returned function once removed. */
export function trackTemporaryPath(path: string) {
  paths.add(path)
  send({ op: 'add', path })
  return () => {
    paths.delete(path)
    send({ op: 'delete', path })
  }
}
