import fs from 'fs'
import path from 'path'
import WebSocket from 'ws'

const CDP_HOST = process.env.NEWFRAME_HARNESS_CDP_HOST || '127.0.0.1'
const CDP_PORT = Number(process.env.NEWFRAME_HARNESS_CDP_PORT || '9333')
const PASSWORD_ENV_KEYS = ['NEWFRAME_HARNESS_PASSWORD', 'FRAME_HARNESS_PASSWORD']
const ENV_FILES = ['.env.harness.local', '.env.harness', '.env.local', '.env']

type UnlockResult = 'already-unlocked' | 'unlocked' | 'skipped'

type CdpTarget = {
  id: string
  title: string
  type: string
  url: string
  webSocketDebuggerUrl?: string
}

type LockState = {
  status: 'checking' | 'locked' | 'unlocked' | 'unknown'
  error?: string
}

type RuntimeEvaluateResult = {
  result?: {
    value?: any
    description?: string
  }
  exceptionDetails?: {
    text?: string
    exception?: {
      description?: string
    }
  }
}

class CdpClient {
  private nextId = 1
  private pending = new Map<number, { resolve: (value: any) => void; reject: (err: Error) => void }>()

  private constructor(private socket: WebSocket) {
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString())
      if (!message.id) return

      const pending = this.pending.get(message.id)
      if (!pending) return

      this.pending.delete(message.id)
      if (message.error) {
        pending.reject(new Error(message.error.message || JSON.stringify(message.error)))
      } else {
        pending.resolve(message.result)
      }
    })

    socket.on('close', () => {
      const err = new Error('CDP socket closed')
      this.pending.forEach(({ reject }) => reject(err))
      this.pending.clear()
    })
  }

  static connect(url: string) {
    return new Promise<CdpClient>((resolve, reject) => {
      const socket = new WebSocket(url)

      socket.once('open', () => resolve(new CdpClient(socket)))
      socket.once('error', reject)
    })
  }

  command<T>(method: string, params: Record<string, any> = {}) {
    const id = this.nextId++
    const payload = JSON.stringify({ id, method, params })

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(payload, (err) => {
        if (!err) return

        this.pending.delete(id)
        reject(err)
      })
    })
  }

  close() {
    this.socket.close()
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`CDP request failed: ${response.status} ${response.statusText}`)
  return response.json() as Promise<T>
}

async function waitForTrayTarget(timeoutMs: number) {
  const started = Date.now()
  const endpoint = `http://${CDP_HOST}:${CDP_PORT}/json`

  while (Date.now() - started < timeoutMs) {
    try {
      const targets = await fetchJson<CdpTarget[]>(endpoint)
      const target = targets.find((candidate) => {
        return candidate.type === 'page' && candidate.url.includes('bundle/tray.html')
      })

      if (target?.webSocketDebuggerUrl) return target
    } catch {
      // Electron may not have opened the debugging endpoint yet.
    }

    await sleep(250)
  }

  throw new Error(`Timed out waiting for tray renderer on ${endpoint}`)
}

function parseEnvValue(value: string) {
  const trimmed = value.trim()
  const quote = trimmed[0]

  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

function readEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return {}

  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .reduce<Record<string, string>>((env, rawLine) => {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) return env

      const normalizedLine = line.startsWith('export ') ? line.slice('export '.length).trim() : line
      const separator = normalizedLine.indexOf('=')
      if (separator === -1) return env

      const key = normalizedLine.slice(0, separator).trim()
      if (!key) return env

      env[key] = parseEnvValue(normalizedLine.slice(separator + 1))
      return env
    }, {})
}

function readHarnessPassword() {
  for (const key of PASSWORD_ENV_KEYS) {
    const value = process.env[key]
    if (value) return value
  }

  for (const file of ENV_FILES) {
    const values = readEnvFile(path.resolve(process.cwd(), file))

    for (const key of PASSWORD_ENV_KEYS) {
      const value = values[key]
      if (value) return value
    }
  }

  return ''
}

async function evaluate<T>(client: CdpClient, expression: string) {
  const response = await client.command<RuntimeEvaluateResult>('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })

  if (response.exceptionDetails) {
    throw new Error(
      response.exceptionDetails.exception?.description ||
        response.exceptionDetails.text ||
        response.result?.description ||
        'CDP Runtime.evaluate failed'
    )
  }

  return response.result?.value as T
}

function lockStateExpression() {
  return `
    (() => {
      const visible = (element) => {
        if (!element) return false
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
      }
      const byLabel = (label) => Array.from(document.querySelectorAll('[aria-label]')).find((element) => {
        return element.getAttribute('aria-label') === label && visible(element)
      })
      const error = document.querySelector('.t2LockError')?.textContent?.trim()

      if (byLabel('Unlock Newframe')) return { status: 'locked', error }
      if (byLabel('Main menu')) return { status: 'unlocked' }
      if (byLabel('Checking Newframe lock')) return { status: 'checking' }
      return { status: 'unknown' }
    })()
  `
}

function submitPasswordExpression(password: string) {
  return `
    (() => {
      const password = ${JSON.stringify(password)}
      const visible = (element) => {
        if (!element) return false
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
      }
      const unlockDialog = Array.from(document.querySelectorAll('[role="dialog"][aria-label="Unlock Newframe"]')).find(visible)
      if (!unlockDialog) return { status: 'not-locked' }

      const input = unlockDialog.querySelector('input[aria-label="Newframe password"]')
      const unlockButton = unlockDialog.querySelector('[role="button"][aria-label="Unlock"], button[aria-label="Unlock"]')
      if (!input || !unlockButton) return { status: 'missing-controls' }

      input.focus()
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      if (setter) setter.call(input, password)
      else input.value = password

      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: password }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      unlockButton.click()
      return { status: 'submitted' }
    })()
  `
}

async function waitForLockState(client: CdpClient, timeoutMs: number) {
  const started = Date.now()
  let latest: LockState = { status: 'unknown' }

  while (Date.now() - started < timeoutMs) {
    latest = await evaluate<LockState>(client, lockStateExpression())
    if (latest.status === 'locked' || latest.status === 'unlocked') return latest
    await sleep(250)
  }

  return latest
}

async function waitForUnlock(client: CdpClient, timeoutMs: number) {
  const started = Date.now()
  let latest: LockState = { status: 'unknown' }

  while (Date.now() - started < timeoutMs) {
    latest = await evaluate<LockState>(client, lockStateExpression())
    if (latest.status === 'unlocked') return latest
    if (latest.status === 'locked' && latest.error) throw new Error(`Unlock failed: ${latest.error}`)
    await sleep(250)
  }

  throw new Error(`Timed out waiting for unlock; last state was ${latest.status}`)
}

export async function unlockHarnessNewframe(options: { optional?: boolean } = {}): Promise<UnlockResult> {
  const target = await waitForTrayTarget(30_000)
  const client = await CdpClient.connect(target.webSocketDebuggerUrl as string)

  try {
    const state = await waitForLockState(client, 15_000)
    if (state.status === 'unlocked') {
      console.log('[harness] Newframe already unlocked')
      return 'already-unlocked'
    }

    if (state.status !== 'locked') {
      throw new Error(`Could not determine Newframe lock state; last state was ${state.status}`)
    }

    const password = readHarnessPassword()
    if (!password) {
      const message = 'Newframe unlock password is not configured'
      if (options.optional) {
        return 'skipped'
      }

      throw new Error(message)
    }

    const submit = await evaluate<{ status: string }>(client, submitPasswordExpression(password))
    if (submit.status !== 'submitted') throw new Error(`Could not submit Newframe password: ${submit.status}`)

    await waitForUnlock(client, 15_000)
    console.log('[harness] Newframe unlocked')
    return 'unlocked'
  } finally {
    client.close()
  }
}
