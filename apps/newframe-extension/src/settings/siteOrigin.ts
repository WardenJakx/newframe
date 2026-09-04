export interface ParsedOrigin {
  origin: string
  protocol: string
}

export function parseOrigin(url = ''): ParsedOrigin {
  try {
    const parsed = new URL(url)
    const origin = parsed.host || parsed.pathname

    return {
      protocol: `${parsed.protocol}//`,
      origin
    }
  } catch {
    console.warn(`could not parse origin: ${url}`)
    return { protocol: '', origin: url }
  }
}
