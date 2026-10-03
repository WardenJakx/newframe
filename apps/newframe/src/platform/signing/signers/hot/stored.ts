import { z } from 'zod'

const encryptedSecretSchema = (bytes: number) =>
  z.strictObject({
    algorithm: z.literal('aes-256-gcm'),
    iv: z.string().regex(/^[0-9a-fA-F]{24}$/),
    authTag: z.string().regex(/^[0-9a-fA-F]{32}$/),
    ciphertext: z.string().regex(new RegExp(`^[0-9a-fA-F]{${bytes * 2}}$`))
  })
const base = {
  version: z.literal(1),
  id: z.string().min(1),
  addresses: z.array(z.string().min(1)).max(1000),
  network: z.string().optional()
}
export const StoredHotSignerSchema = z
  .discriminatedUnion('type', [
    z.strictObject({
      ...base,
      type: z.literal('seed'),
      encryptedSeed: encryptedSecretSchema(64),
      derivationPaths: z
        .array(
          z
            .string()
            .max(256)
            .regex(/^m(?:\/(?:0|[1-9][0-9]*)'?)+$/)
        )
        .min(1)
        .max(1000)
        .optional()
    }),
    z.strictObject({ ...base, type: z.literal('ring'), encryptedKeys: z.array(encryptedSecretSchema(32)) })
  ])
  .refine(
    (record) =>
      record.type === 'seed'
        ? record.addresses.length === (record.derivationPaths?.length ?? 100)
        : record.addresses.length === record.encryptedKeys.length,
    'Signer address and secret counts must match'
  )
export type StoredHotSigner = z.infer<typeof StoredHotSignerSchema>
