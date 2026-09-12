import { z } from 'zod'
import { SigningKey } from 'ethers'

const hex = (bytes: number) =>
  z
    .string()
    .regex(new RegExp(`^[0-9a-fA-F]{${bytes * 2}}$`))
    .transform((s) => s.toLowerCase())

export const AirGapPublicAccountSchema = z.strictObject({
  publicKey: hex(33).refine((key) => {
    try {
      return /^(02|03)/.test(key) && SigningKey.computePublicKey(`0x${key}`, true) === `0x${key}`
    } catch {
      return false
    }
  }, 'Invalid compressed public key'),
  chainCode: hex(32),
  originPath: z
    .string()
    .regex(/^m\/44'\/60'\/(0|[1-9]\d*)'$/)
    .refine((path) => {
      const index = Number(path.split('/')[3]?.slice(0, -1))
      return Number.isInteger(index) && index >= 0 && index < 0x80000000
    }, 'Unsupported account origin'),
  sourceFingerprint: hex(4),
  name: z.string().trim().min(1).max(128)
})
export type AirGapPublicAccount = z.infer<typeof AirGapPublicAccountSchema>

export const AirGapRequestReferenceSchema = z.strictObject({
  signerId: z.string().min(1),
  requestId: z.string().min(1),
  sessionId: z.uuid()
})
export type AirGapRequestReference = z.infer<typeof AirGapRequestReferenceSchema>

export const AirGapPendingSummarySchema = AirGapRequestReferenceSchema.omit({ signerId: true }).extend({
  progress: z.number().finite().min(0).max(1)
})
export type AirGapPendingSummary = z.infer<typeof AirGapPendingSummarySchema>
