import { outbound } from '../../outbound/index.ts'

export async function fetchWithTimeout(url: string, options: RequestInit, timeout: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    return await outbound.request(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
