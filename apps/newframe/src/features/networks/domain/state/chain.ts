import { z } from 'zod'

import { TokenImageSchema } from '../../../tokens/domain/state/token.ts'
import { ColorwayPaletteSchema } from './colors.ts'
import { ConnectionSchema } from './connection.ts'
import { GasSchema } from './gas.ts'
import { NativeCurrencySchema } from './nativeCurrency.ts'

const layerValues = ['mainnet', 'rollup', 'sidechain', 'testnet'] as const

export const ChainIdSchema = z.object({
  id: z.coerce.number(),
  type: z.literal('ethereum')
})

export const ChainSchema = z
  .object({
    id: z.coerce.number(),
    type: z.literal('ethereum').default('ethereum'),
    name: z.string(),
    symbol: z.string().optional(),
    on: z.boolean(),
    connection: z.object({
      primary: ConnectionSchema,
      secondary: ConnectionSchema
    }),
    layer: z.enum(layerValues).optional(),
    isTestnet: z.boolean().default(false),
    explorer: z.string().default('')
  })
  .loose()

export const ChainMetadataSchema = z
  .object({
    gas: GasSchema,
    icon: z.string().optional(),
    image: TokenImageSchema.optional(),
    primaryColor: ColorwayPaletteSchema.keyof(),
    nativeCurrency: NativeCurrencySchema
  })
  .loose()

export type ChainId = z.infer<typeof ChainIdSchema>
export type Chain = z.infer<typeof ChainSchema>
export type ChainMetadata = z.infer<typeof ChainMetadataSchema>
