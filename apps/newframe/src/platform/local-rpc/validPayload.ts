import log from 'electron-log'

export default function <T extends JSONRPCRequestPayload>(data: string): T | false {
  try {
    const payload: unknown = JSON.parse(data)

    if (typeof payload === 'object' && payload !== null && 'id' in payload && 'method' in payload) {
      const payloadRecord = payload as Record<string, unknown>
      payloadRecord.params ??= []

      return (
        !!(
          (typeof payload.id === 'number' || typeof payload.id === 'string') &&
          typeof payloadRecord.jsonrpc === 'string' &&
          typeof payloadRecord.method === 'string' &&
          (Array.isArray(payloadRecord.params) || typeof payloadRecord.params === 'object')
        ) && (payloadRecord as T)
      )
    }
  } catch (e) {
    log.info('Error parsing payload: ', data, e)
  }

  return false
}
