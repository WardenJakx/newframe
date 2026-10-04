import type { SettingsUpdateCommand } from '../../../app/contracts/operations.ts'

export type SettingsUpdateInput = SettingsUpdateCommand extends infer Command
  ? Command extends SettingsUpdateCommand
    ? Omit<Command, 'type'>
    : never
  : never

export type PersistSetting = (input: SettingsUpdateInput) => void
