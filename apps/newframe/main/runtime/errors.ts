export function getErrorCode(error: unknown) {
  return error instanceof Error && 'code' in error ? String(error.code) : undefined
}
