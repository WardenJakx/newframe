import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'

import './settings-panel.css'

const surfaceRecipe = cva('nf-settings-surface', {
  variants: {
    spacing: {
      attached: null,
      separated: 'nf-settings-surface--separated'
    }
  },
  defaultVariants: { spacing: 'attached' }
})

const toneRecipe = cva('', {
  variants: {
    tone: {
      primary: 'nf-settings-tone--primary',
      success: 'nf-settings-tone--success',
      warning: 'nf-settings-tone--warning',
      danger: 'nf-settings-tone--danger'
    }
  },
  defaultVariants: { tone: 'primary' }
})

export type SettingsTone = NonNullable<VariantProps<typeof toneRecipe>['tone']>

export type SettingsViewportProps = {
  children: ReactNode
}

export function SettingsViewport({ children }: SettingsViewportProps) {
  return <main className='nf-settings-viewport'>{children}</main>
}

export type SettingsSurfaceProps = VariantProps<typeof surfaceRecipe> & {
  children: ReactNode
}

export function SettingsSurface({ children, spacing }: SettingsSurfaceProps) {
  return <section className={surfaceRecipe({ spacing })}>{children}</section>
}

export type SettingsGroupProps = {
  children: ReactNode
}

export function SettingsGroup({ children }: SettingsGroupProps) {
  return <div className='nf-settings-group'>{children}</div>
}

export type SettingsConnectionActionProps = {
  disabled?: boolean
  imageSource: string
  label: string
  onPress: () => void
  tone: Extract<SettingsTone, 'success' | 'danger'>
}

export function SettingsConnectionAction({
  disabled = false,
  imageSource,
  label,
  onPress,
  tone
}: SettingsConnectionActionProps) {
  return (
    <button
      className={`nf-settings-connection ${toneRecipe({ tone })}`}
      disabled={disabled}
      onClick={onPress}
      type='button'
    >
      <span className='nf-settings-connection__image'>
        <img alt='' src={imageSource} />
      </span>
      <span className='nf-settings-connection__label'>{label}</span>
      <span aria-hidden='true' className='nf-settings-connection__summon'>
        <svg focusable='false' viewBox='0 0 512 512'>
          <path
            d='M416 32h-64c-17.7 0-32 14.3-32 32s14.3 32 32 32h64c17.7 0 32 14.3 32 32v256c0 17.7-14.3 32-32 32h-64c-17.7 0-32 14.3-32 32s14.3 32 32 32h64c53 0 96-43 96-96V128c0-53-43-96-96-96ZM342.6 233.4l-128-128a32 32 0 0 0-45.3 45.3l73.5 73.3H32a32 32 0 0 0 0 64h210.8l-73.4 73.4a32 32 0 0 0 45.3 45.2l128-128a32 32 0 0 0-.1-45.2Z'
            fill='currentColor'
          />
        </svg>
      </span>
    </button>
  )
}

export type SettingsMessageProps = {
  action?: {
    href: string
    label: string
  }
  detailLines: readonly string[]
  emphasizedDetail?: number
  title: string
}

export function SettingsMessage({ action, detailLines, emphasizedDetail, title }: SettingsMessageProps) {
  return (
    <div className='nf-settings-message'>
      <div className='nf-settings-message__body'>
        <strong className='nf-settings-message__title'>{title}</strong>
        <div className='nf-settings-message__details'>
          {detailLines.map((line, index) => (
            <span
              className={index === emphasizedDetail ? 'nf-settings-message__detail--emphasized' : undefined}
              key={`${index}-${line}`}
            >
              {line}
            </span>
          ))}
        </div>
      </div>
      {action ? (
        <a className='nf-settings-message__action' href={action.href} rel='noreferrer' target='_blank'>
          {action.label}
        </a>
      ) : null}
    </div>
  )
}

export type SettingsHeadingProps = {
  children: ReactNode
}

export function SettingsHeading({ children }: SettingsHeadingProps) {
  return (
    <h1 className='nf-settings-heading'>
      <span aria-hidden='true' className='nf-settings-heading__icon'>
        <svg focusable='false' viewBox='0 0 512 512'>
          <path
            d='M448 32c35.3 0 64 28.7 64 64v320c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V96c0-35.3 28.7-64 64-64h384ZM96 96a32 32 0 0 0 0 64h320a32 32 0 0 0 0-64H96Z'
            fill='currentColor'
          />
        </svg>
      </span>
      {children}
    </h1>
  )
}

export type SettingsStatusProps = {
  label: string
  tone: Extract<SettingsTone, 'success' | 'warning' | 'danger'>
  value: string
}

export function SettingsStatus({ label, tone, value }: SettingsStatusProps) {
  return (
    <div className='nf-settings-status'>
      <span className={`nf-settings-status__label ${toneRecipe({ tone })}`}>{label}</span>
      <span className='nf-settings-status__value'>{value}</span>
    </div>
  )
}

export type SettingsDisclosureProps = {
  description: string
  expanded: boolean
  onPress: () => void
  title: ReactNode
}

export function SettingsDisclosure({ description, expanded, onPress, title }: SettingsDisclosureProps) {
  return (
    <button aria-expanded={expanded} className='nf-settings-disclosure' onClick={onPress} type='button'>
      <span className='nf-settings-disclosure__label'>
        <span className='nf-settings-disclosure__title'>{title}</span>
        <span className='nf-settings-disclosure__description'>{description}</span>
      </span>
      <span aria-hidden='true' className='nf-settings-disclosure__chevron'>
        <svg focusable='false' viewBox='0 0 448 512'>
          <path
            d='M201.4 374.6a32 32 0 0 0 45.3 0l160-160a32 32 0 0 0-45.3-45.3L224 306.7 86.6 169.4a32 32 0 0 0-45.3 45.3l160 160Z'
            fill='currentColor'
          />
        </svg>
      </span>
    </button>
  )
}

export type SettingsSelectionOption = {
  disabled?: boolean
  id: string
  label: string
  selected: boolean
}

export type SettingsSelectionGridProps = {
  label: string
  onSelect: (id: string) => void
  options: readonly SettingsSelectionOption[]
}

export function SettingsSelectionGrid({ label, onSelect, options }: SettingsSelectionGridProps) {
  return (
    <div aria-label={label} className='nf-settings-selection' role='group'>
      {options.map((option) => (
        <button
          aria-pressed={option.selected}
          className='nf-settings-selection__option'
          disabled={option.disabled}
          key={option.id}
          onClick={() => onSelect(option.id)}
          type='button'
        >
          <span aria-hidden='true' className='nf-settings-selection__indicator' />
          <span className='nf-settings-selection__label'>{option.label}</span>
        </button>
      ))}
    </div>
  )
}

export type SettingsActionProps = {
  label: string
  onPress: () => void
  tone?: Extract<SettingsTone, 'primary' | 'danger'>
}

export function SettingsAction({ label, onPress, tone = 'primary' }: SettingsActionProps) {
  return (
    <button className={`nf-settings-action ${toneRecipe({ tone })}`} onClick={onPress} type='button'>
      {label}
    </button>
  )
}

export type SettingsModeProps = {
  currentLabel: string
  currentTone: Extract<SettingsTone, 'success' | 'warning'>
  currentValue: string
  onToggle: () => void
  toggleLabel: string
  toggleTone: Extract<SettingsTone, 'success' | 'warning'>
  toggleValue: string
}

export function SettingsMode({
  currentLabel,
  currentTone,
  currentValue,
  onToggle,
  toggleLabel,
  toggleTone,
  toggleValue
}: SettingsModeProps) {
  return (
    <div className='nf-settings-mode'>
      <div className='nf-settings-mode__current'>
        <span>{currentLabel} </span>
        <strong className={toneRecipe({ tone: currentTone })}>{currentValue}</strong>
      </div>
      <button className='nf-settings-mode__toggle' onClick={onToggle} type='button'>
        <span>{toggleLabel} </span>
        <strong className={toneRecipe({ tone: toggleTone })}>{toggleValue}</strong>
      </button>
    </div>
  )
}
