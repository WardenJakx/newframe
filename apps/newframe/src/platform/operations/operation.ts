import { z } from 'zod'

const OperationStatusSchema = z.enum(['pending', 'succeeded', 'failed'])

const OperationEntityRefSchema = z.strictObject({
  type: z.enum(['account', 'profile', 'signer', 'chain', 'transaction', 'request', 'order', 'token']),
  id: z.string().min(1).max(256)
})

const OperationSafeErrorSchema = z.strictObject({
  code: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  message: z.string().min(1).max(256)
})

export const OperationRecordSchema = z
  .strictObject({
    id: z.string().min(1).max(256),
    type: z
      .string()
      .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/)
      .max(128),
    status: OperationStatusSchema,
    phase: z
      .string()
      .regex(/^[a-z][a-z0-9_-]*$/)
      .max(64)
      .optional(),
    error: OperationSafeErrorSchema.optional(),
    entityRefs: z.array(OperationEntityRefSchema).max(16).optional(),
    startedAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    finishedAt: z.number().int().nonnegative().optional()
  })
  .refine((operation) => operation.updatedAt >= operation.startedAt, {
    message: 'Operation updatedAt cannot precede startedAt',
    path: ['updatedAt']
  })
  .refine(
    (operation) =>
      operation.status === 'pending'
        ? operation.finishedAt === undefined && operation.error === undefined
        : operation.finishedAt !== undefined && operation.finishedAt >= operation.updatedAt,
    { message: 'Operation terminal timestamps and errors must match status' }
  )
  .refine((operation) => operation.status === 'failed' || operation.error === undefined, {
    message: 'Only failed operations may include an error',
    path: ['error']
  })

export const OperationCollectionSchema = z.record(z.string(), OperationRecordSchema)

export type OperationStatus = z.infer<typeof OperationStatusSchema>
export type OperationEntityRef = z.infer<typeof OperationEntityRefSchema>
export type OperationSafeError = z.infer<typeof OperationSafeErrorSchema>
export type OperationRecord = z.infer<typeof OperationRecordSchema>
export type OperationCollection = z.infer<typeof OperationCollectionSchema>
