import net from 'node:net'

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function tail(value: string, maxLength = 8_000) {
  return value.length > maxLength ? value.slice(value.length - maxLength) : value
}

export async function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs: number) {
  let timer: NodeJS.Timeout | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function isPortFree(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer()

    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

export async function assertPortFree(port: number, label: string) {
  if (!(await isPortFree(port))) throw new Error(`${label} port ${port} is already in use`)
}

export async function waitForHttpOk(url: string, label: string, timeoutMs = 15_000) {
  const started = Date.now()
  let lastError: unknown

  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`${label} returned HTTP ${response.status}`)
    } catch (err) {
      lastError = err
    }

    await sleep(250)
  }

  throw new Error(
    `Timed out waiting for ${label} at ${url}${lastError instanceof Error ? `: ${lastError.message}` : ''}`
  )
}
