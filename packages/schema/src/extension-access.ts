import { z } from 'zod'

export const ExtensionAccessSchema = z.object({
  all: z.boolean().default(false).describe('Expose every account in the current profile'),
  accounts: z.array(z.string()).default([]).describe('Account ids the extension may see, across profiles'),
  selected: z
    .record(z.string().describe('Profile Id'), z.string().describe('Account Id'))
    .default({})
    .describe('The account the extension last used in each profile')
})

export type ExtensionAccess = z.infer<typeof ExtensionAccessSchema>
