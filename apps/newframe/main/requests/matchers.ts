import { z, ZodError } from 'zod'

export function createRequestMatcher<T extends z.ZodType>(method: string, params: T) {
  return z.object({
    id: z.number(),
    jsonrpc: z.literal('2.0'),
    params
  })
}

export function generateError(err: ZodError<any>) {
  const issue = err.issues[0]
  if (!issue) return new Error('')

  // zod 4 reports a missing required field as an invalid_type issue with an undefined input
  const isMissingField = issue.code === 'invalid_type' && issue.message.endsWith('received undefined')

  if (isMissingField) {
    const field = issue.path[issue.path.length - 1]
    return new Error(`${String(field)} parameter is required`)
  }

  return new Error(issue.message)
}
