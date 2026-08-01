import type { SettingsUpdateCommand } from '../../../../../contracts/operations'

export type SettingsUpdateInput = SettingsUpdateCommand extends infer Command
  ? Command extends SettingsUpdateCommand
    ? Omit<Command, 'type'>
    : never
  : never

export type PersistSetting = (input: SettingsUpdateInput) => void
