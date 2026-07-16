import svg from '../../../../resources/svg'
import { activateOnKeyboard } from './keyboard'
import { Toggle } from './Toggle'

export function SettingsToggleRow({
  detail,
  label,
  on,
  onToggle
}: {
  detail?: string
  label: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <div className='t2SettingsRow'>
      <div className='t2SettingsRowText'>
        <div className='t2SettingsRowTitle'>{label}</div>
        {detail ? <div className='t2SettingsRowDetail'>{detail}</div> : null}
      </div>
      <Toggle label={label} on={on} onToggle={onToggle} />
    </div>
  )
}

export function SettingsSelectRow<T>({
  currentValue,
  label,
  onChange,
  options
}: {
  currentValue: T
  label: string
  onChange: (value: T) => void
  options: Array<{ text: string; value: T }>
}) {
  const index = options.findIndex((option) => option.value === currentValue)
  const current = index >= 0 ? options[index] : options[0]
  const next = options[(index + 1 + options.length) % options.length]

  return (
    <div
      aria-label={`${label}: ${current.text}`}
      className='t2SettingsRow t2SettingsSelectRow'
      onClick={() => onChange(next.value)}
      onKeyDown={(event) => activateOnKeyboard(event, () => onChange(next.value))}
      role='button'
      tabIndex={0}
    >
      <div className='t2SettingsRowText'>
        <div className='t2SettingsRowTitle'>{label}</div>
      </div>
      <div className='t2SettingsRowValue'>
        <span className='traySpan'>{current.text}</span>
        {svg.arrowRight(10)}
      </div>
    </div>
  )
}

export function SettingsActionRow({
  action,
  danger = false,
  label,
  onAction
}: {
  action: string
  danger?: boolean
  label: string
  onAction: () => void
}) {
  return (
    <div
      aria-label={label}
      className={
        danger ? 't2SettingsRow t2SettingsActionRow t2SettingsDangerRow' : 't2SettingsRow t2SettingsActionRow'
      }
      onClick={onAction}
      onKeyDown={(event) => activateOnKeyboard(event, onAction)}
      role='button'
      tabIndex={0}
    >
      <div className='t2SettingsRowText'>
        <div className='t2SettingsRowTitle'>{label}</div>
      </div>
      <div className='t2SettingsActionValue'>{action}</div>
    </div>
  )
}
