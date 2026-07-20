import { Button } from '@newframe/ui/button'
import { Image } from '@newframe/ui/image'
import { Inline } from '@newframe/ui/inline'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import type { Key, ReactNode } from 'react'

import { cva } from '../../../../../../resources/styled-system/css/cva.js'
import { sva } from '../../../../../../resources/styled-system/css/sva.js'
import { DisplayCoinBalance } from '../../../../../../resources/Components/DisplayValue'
import StatusGlyph from '../../../../../../resources/Components/StatusGlyph'
import { cachedImageUrl } from '../../../../../../resources/domain/imageCache'
import svg from '../../../../../../resources/svg'

export type TransactionProgressData = {
  status?: string
  notice?: string
  txHash?: string
  confirmations?: number
  confirmationTarget?: number
  blockNumber?: number | string
}

export type TransactionInformationEffect = {
  id: Key
  direction: string
  kind?: string
  logoURI?: string
  symbol?: string
  amount?: any
  decimals?: number
  label: ReactNode
  detail?: ReactNode
}

export type TransactionInformationDetailRow = {
  label: string
  value?: ReactNode
  onClick?: () => void
}

export type TransactionInformationNativeCurrency = { icon?: string }

export type TransactionInformationProps = {
  networkName: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  statusLabel: ReactNode
  notice?: ReactNode
  progress: TransactionProgressData
  effects: TransactionInformationEffect[]
  effectsEmptyText: ReactNode
  details: TransactionInformationDetailRow[]
  nativeCurrency: TransactionInformationNativeCurrency
  heroVariant?: 'default' | 'elevated'
  children?: ReactNode
}

export const shortAddress = (address?: string) => {
  if (!address) return ''
  return `${address.slice(0, 8)}...${address.slice(-6)}`
}

const transactionRecipe = cva({
  base: {
    width: '100%',
    maxWidth: 'page-compact',
    marginInline: 'auto',
    paddingInline: '5',
    paddingBlockEnd: '9'
  }
})

const heroRecipe = cva({
  base: { overflow: 'hidden', wordBreak: 'break-word' },
  variants: {
    elevated: {
      true: { background: 'bg.raised' },
      false: { background: 'bg.primary' }
    }
  },
  defaultVariants: { elevated: false }
})

const badgeRecipe = cva({
  base: {
    display: 'inline-flex',
    width: 'fit-content',
    minHeight: 'button-compact',
    alignItems: 'center',
    paddingInline: '4',
    borderRadius: 'pill',
    background: 'bg.control'
  }
})

const progressRecipe = sva({
  slots: ['step', 'rail', 'marker', 'copy'],
  base: {
    step: {
      position: 'relative',
      display: 'grid',
      gridTemplateColumns: 'token(sizes.icon-button-small) minmax(0, 1fr)',
      minHeight: 'panel-header'
    },
    rail: {
      position: 'absolute',
      insetInlineStart: '7',
      insetBlockStart: 'token(sizes.icon-button-small)',
      insetBlockEnd: 'calc(-1 * token(spacing.7))',
      width: 'progress-rail',
      background: 'border.subtle'
    },
    marker: {
      position: 'relative',
      zIndex: 'header',
      display: 'flex',
      justifyContent: 'center',
      paddingBlockStart: '4'
    },
    copy: { minWidth: 0, paddingBlockStart: '3', paddingBlockEnd: '5', paddingInlineStart: '3' }
  },
  variants: {
    state: {
      idle: {},
      active: { rail: { background: 'border.subtle' } },
      complete: { rail: { background: 'action.primary' } },
      error: { rail: { background: 'status.danger' } }
    },
    last: {
      true: { step: { minHeight: 'button-large' }, rail: { display: 'none' } },
      false: {}
    }
  },
  defaultVariants: { last: false, state: 'idle' }
})

const sectionRecipe = cva({
  base: { overflow: 'hidden' }
})

const sectionHeaderRecipe = cva({
  base: {
    minHeight: 'icon-button-medium',
    display: 'flex',
    alignItems: 'center',
    paddingInline: '6',
    background: 'bg.control'
  }
})

const effectRecipe = sva({
  slots: ['root', 'icon', 'meta', 'amount'],
  base: {
    root: {
      minHeight: 'field',
      display: 'grid',
      gridTemplateColumns: 'token(sizes.icon-button-small) minmax(0, 1fr) auto',
      alignItems: 'center',
      gap: '5',
      padding: '4 5',
      borderRadius: 'small',
      background: 'bg.raised'
    },
    icon: {
      width: 'icon-button-small',
      height: 'icon-button-small',
      display: 'grid',
      placeItems: 'center',
      overflow: 'hidden',
      borderWidth: 'thin',
      borderStyle: 'solid',
      borderColor: 'border.subtle',
      borderRadius: 'pill',
      background: 'bg.control'
    },
    meta: { minWidth: 0 },
    amount: {
      display: 'inline-flex',
      minWidth: 0,
      alignItems: 'baseline',
      justifyContent: 'flex-end',
      whiteSpace: 'nowrap'
    }
  },
  variants: {
    direction: {
      in: {
        icon: {
          borderColor: 'action.primary.border',
          background: 'action.primary.subtle',
          color: 'action.primary'
        },
        amount: { color: 'action.primary' }
      },
      out: {
        icon: {
          borderColor: 'action.danger.border',
          background: 'action.danger.subtle',
          color: 'status.danger'
        },
        amount: { color: 'status.danger' }
      },
      neutral: { amount: { color: 'text.primary' } }
    }
  },
  defaultVariants: { direction: 'neutral' }
})

const statusRank = (status?: string) => {
  switch (status) {
    case 'pending':
      return 1
    case 'sending':
    case 'sent':
    case 'verifying':
      return 2
    case 'confirming':
      return 3
    case 'confirmed':
      return 4
    default:
      return 0
  }
}

const stepState = (status: string | undefined, index: number) => {
  if (status === 'error' || status === 'declined') {
    if (index < 1) return 'complete' as const
    if (index === 1) return 'error' as const
    return 'idle' as const
  }
  const rank = statusRank(status)
  if (rank > index) return 'complete' as const
  if (rank === index) return 'active' as const
  return 'idle' as const
}

const confirmationDetail = (confirmations: number, confirmationTarget?: number) =>
  confirmationTarget
    ? `${confirmations}/${confirmationTarget} confirmations`
    : `${confirmations} confirmations`

function TransactionProgress({ progress }: { progress: TransactionProgressData }) {
  const confirmations = progress.confirmations || 0
  const steps = [
    { title: 'Review', detail: progress.status ? 'Request accepted' : 'Ready to sign' },
    {
      title: 'Signed',
      detail:
        progress.status === 'pending'
          ? progress.notice || 'Waiting for signature'
          : statusRank(progress.status) > 1
            ? 'Signature complete'
            : 'Awaiting signature'
    },
    {
      title: 'Submitted',
      detail: progress.txHash
        ? shortAddress(progress.txHash)
        : progress.status === 'sending'
          ? 'Broadcasting'
          : 'Not sent'
    },
    {
      title: 'Confirmed',
      detail:
        progress.status === 'confirmed'
          ? progress.blockNumber
            ? `Block ${progress.blockNumber}`
            : 'Finalized'
          : progress.status === 'confirming'
            ? confirmationDetail(confirmations, progress.confirmationTarget)
            : 'Waiting for inclusion'
    }
  ]

  return (
    <Stack element='section' gap='none' label='Transaction progress'>
      {steps.map((step, index) => {
        const state = stepState(progress.status, index)
        const styles = progressRecipe({ last: index === steps.length - 1, state })
        return (
          <div className={styles.step} key={step.title}>
            <span className={styles.rail} />
            <span className={styles.marker}>
              <StatusGlyph
                size='small'
                state={
                  state === 'active'
                    ? 'pending'
                    : state === 'complete'
                      ? 'completed'
                      : state === 'error'
                        ? 'failed'
                        : 'idle'
                }
              />
            </span>
            <span className={styles.copy}>
              <Stack gap='none'>
                <Text
                  tone={state === 'active' ? 'accent' : state === 'error' ? 'danger' : 'primary'}
                  variant='control'
                >
                  {step.title}
                </Text>
                <Text tone='secondary' variant='caption'>
                  {step.detail}
                </Text>
              </Stack>
            </span>
          </div>
        )
      })}
    </Stack>
  )
}

function AssetIcon({
  direction,
  effect,
  nativeCurrency
}: {
  direction: 'in' | 'out' | 'neutral'
  effect: TransactionInformationEffect
  nativeCurrency: TransactionInformationNativeCurrency
}) {
  const icon = effect.logoURI || (effect.kind === 'native' ? nativeCurrency.icon : '')
  const symbol = (effect.symbol || '?').trim() || '?'
  const styles = effectRecipe({ direction })

  return (
    <span className={styles.icon} data-effect-icon-direction={direction}>
      {icon ? (
        <Image alt='' source={cachedImageUrl(icon)} />
      ) : effect.kind === 'native' && symbol.toUpperCase() === 'ETH' ? (
        svg.eth(14)
      ) : (
        <Text align='center' variant='microCode' truncate>
          {symbol}
        </Text>
      )}
    </span>
  )
}

function TransactionEffects({
  effects,
  emptyText,
  nativeCurrency
}: {
  effects: TransactionInformationEffect[]
  emptyText: ReactNode
  nativeCurrency: TransactionInformationNativeCurrency
}) {
  return (
    <Surface padding='none' radius='card' tone='card'>
      <section aria-label='Transaction effects' className={sectionRecipe()}>
        <div className={sectionHeaderRecipe()}>
          <Text tone='secondary' variant='overline'>
            Transaction effects
          </Text>
        </div>
        <Stack gap='xsmall'>
          <Surface padding='small' radius='none' tone='card'>
            {effects.length ? (
              <Stack gap='xsmall'>
                {effects.map((effect) => {
                  const direction =
                    effect.direction === 'in' || effect.direction === 'out' ? effect.direction : 'neutral'
                  const styles = effectRecipe({ direction })
                  const directionLabel =
                    direction === 'in'
                      ? 'Incoming asset effect'
                      : direction === 'out'
                        ? 'Outgoing asset effect'
                        : 'Neutral asset effect'
                  return (
                    <div
                      aria-label={directionLabel}
                      className={styles.root}
                      data-effect-direction={direction}
                      key={effect.id}
                      role='group'
                    >
                      <AssetIcon direction={direction} effect={effect} nativeCurrency={nativeCurrency} />
                      <span className={styles.meta}>
                        <Stack gap='none'>
                          <Text variant='control' truncate>
                            {effect.label}
                          </Text>
                          {effect.detail ? (
                            <Text tone='secondary' variant='caption'>
                              {effect.detail}
                            </Text>
                          ) : null}
                        </Stack>
                      </span>
                      <span className={styles.amount}>
                        {direction === 'out' ? <Text variant='numeric'>-</Text> : null}
                        {direction === 'in' ? <Text variant='numeric'>+</Text> : null}
                        <DisplayCoinBalance
                          amount={effect.amount || '0x0'}
                          decimals={effect.decimals}
                          symbol={effect.symbol || '?'}
                        />
                      </span>
                    </div>
                  )
                })}
              </Stack>
            ) : (
              <Surface padding='medium' radius='small' tone='raised'>
                <Text align='center' tone='secondary' variant='caption'>
                  {emptyText}
                </Text>
              </Surface>
            )}
          </Surface>
        </Stack>
      </section>
    </Surface>
  )
}

function DetailRow({ label, value, onClick }: TransactionInformationDetailRow) {
  if (!value) return null
  const content = (
    <Inline align='center' gap='small' justify='between'>
      <Text tone='secondary' variant='overline' shrink={false}>
        {label}
      </Text>
      <Text align='end' variant='code'>
        {value}
      </Text>
    </Inline>
  )
  return onClick ? (
    <Button appearance='row' onPress={onClick} size='medium' width='full'>
      {content}
    </Button>
  ) : (
    <Surface padding='small' radius='small' tone='raised'>
      {content}
    </Surface>
  )
}

export default function TransactionInformation({
  networkName,
  title,
  subtitle,
  statusLabel,
  notice,
  progress,
  effects,
  effectsEmptyText,
  details,
  nativeCurrency,
  heroVariant = 'default',
  children
}: TransactionInformationProps) {
  return (
    <div className={transactionRecipe()}>
      <Stack gap='small'>
        <Surface border='subtle' padding='medium' radius='card' tone='card'>
          <section className={heroRecipe({ elevated: heroVariant === 'elevated' })}>
            <Stack gap='small'>
              <span className={badgeRecipe()}>
                <Text tone='accent' variant='caption'>
                  {networkName}
                </Text>
              </span>
              <Stack gap='xsmall'>
                <Text variant='heading'>{title}</Text>
                {subtitle ? (
                  <Text tone='secondary' variant='supporting'>
                    {subtitle}
                  </Text>
                ) : null}
              </Stack>
              <output className={badgeRecipe()}>
                <Text tone='accent' variant='overline'>
                  {statusLabel}
                </Text>
              </output>
              {notice ? (
                <div role='alert'>
                  <Text tone='danger' variant='caption'>
                    {notice}
                  </Text>
                </div>
              ) : null}
            </Stack>
          </section>
        </Surface>

        <TransactionProgress progress={progress} />
        <TransactionEffects effects={effects} emptyText={effectsEmptyText} nativeCurrency={nativeCurrency} />

        <Surface padding='none' radius='card' tone='card'>
          <section aria-label='Transaction details' className={sectionRecipe()}>
            <div className={sectionHeaderRecipe()}>
              <Text tone='secondary' variant='overline'>
                Transaction details
              </Text>
            </div>
            <Surface padding='small' radius='none' tone='card'>
              <Stack gap='xsmall'>
                {details.map((detail, index) => (
                  <DetailRow key={`${detail.label}-${index}`} {...detail} />
                ))}
              </Stack>
            </Surface>
          </section>
        </Surface>

        {children}
      </Stack>
    </div>
  )
}
