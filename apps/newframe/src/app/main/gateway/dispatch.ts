/** Transport-independent admission. Handlers receive only validated input and admitted context. */
export interface GatewayOperation<TInput, TContext, TResult> {
  parse(input: unknown): { success: true; data: TInput } | { success: false }
  authorize(input: TInput, context: TContext): boolean | Promise<boolean>
  handle(input: TInput, context: TContext): TResult | Promise<TResult>
  validateResult?(result: TResult): boolean
}

export type GatewayResult<TResult> =
  | { ok: true; value: TResult }
  | { ok: false; error: 'invalid_request' | 'unauthorized' | 'operation_failed' }

export async function dispatchGatewayOperation<TInput, TContext, TResult>(
  operation: GatewayOperation<TInput, TContext, TResult>,
  input: unknown,
  context: TContext | undefined,
  onError: (error: unknown) => void = () => {}
): Promise<GatewayResult<TResult>> {
  if (!context) {
    return { ok: false, error: 'unauthorized' }
  }
  try {
    const parsed = operation.parse(input)
    if (!parsed.success) {
      return { ok: false, error: 'invalid_request' }
    }
    if (!(await operation.authorize(parsed.data, context))) {
      return { ok: false, error: 'unauthorized' }
    }
    const value = await operation.handle(parsed.data, context)
    if (operation.validateResult && !operation.validateResult(value)) {
      throw new Error('Invalid gateway operation result')
    }
    return { ok: true, value }
  } catch (error) {
    onError(error)
    return { ok: false, error: 'operation_failed' }
  }
}
