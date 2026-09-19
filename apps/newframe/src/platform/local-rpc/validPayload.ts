import log from 'electron-log'
import type { z } from 'zod'

export default function <TSchema extends z.ZodType>(
  data: string,
  schema: TSchema
): z.output<TSchema> | false {
  try {
    const payload: unknown = JSON.parse(data)
    const parsed = schema.safeParse(payload)
    return parsed.success ? parsed.data : false
  } catch (e) {
    log.info('Error parsing payload: ', data, e)
  }

  return false
}
