import { Button } from '@newframe/ui/button'
import { Disclosure } from '@newframe/ui/disclosure'
import { Icon } from '@newframe/ui/icon'
import { Image } from '@newframe/ui/image'
import { Inline } from '@newframe/ui/inline'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { useRef, useState, type ReactNode } from 'react'

import { cva } from '../../../../../../../generated/styled-system/css/cva.js'
import { sva } from '../../../../../../../generated/styled-system/css/sva.js'
import type {
  ClipboardCapability,
  TokenImageCapability
} from '../../../../../../shared/renderer/capabilities'
import { useTokenImageHydration } from '../../../../../../shared/renderer/hooks/useTokenImageHydration'
import { CopyButton } from '../../../../../../shared/renderer/ui/CopyButton'
import { imageSource, persistedImageSource } from '../../../../../asset-data/domain/image'
import type { NativeCurrency } from '../../../../../networks/domain/state/nativeCurrency'
import type { TransactionEffect } from '../../../../../transactions/domain'
import type { SourceValue } from '../../../format/displayValue'
import { DisplayCoinBalance } from '../../../ui/DisplayValue'
import { RequestOrigin } from '../../../ui/RequestOrigin'

type TransactionInformationEffect = Omit<TransactionEffect, 'amount' | 'detail' | 'label'> & {
  amount?: SourceValue
  label: ReactNode
  detail?: ReactNode
  tokenId?: string
}

export type TransactionInformationDetailRow = {
  label: string
  value?: ReactNode
  onClick?: () => void
  actionLabel?: string
}

type TransactionInformationNativeCurrency = Pick<NativeCurrency, 'image' | 'symbol'>

type TransactionInformationCalldata = {
  digest?: string
  data: string
}

export type TransactionInformationProps = {
  imageCapability: TokenImageCapability
  originName: ReactNode
  favicon?: string
  networkName: ReactNode
  networkIcon?: string
  statusLabel: ReactNode
  notice?: ReactNode
  statusDetails?: ReactNode
  actionTitle?: ReactNode
  actionNotice?: ReactNode
  beforeDetails?: ReactNode
  effects?: TransactionInformationEffect[]
  effectsEmptyText?: ReactNode
  effectsNotice?: ReactNode
  details: TransactionInformationDetailRow[]
  wrapDetailValues?: boolean
  calldata?: TransactionInformationCalldata
  clipboard?: ClipboardCapability
  verification?: Array<{ label: string; value: string }>
  rawTransaction?: string
  nativeCurrency: TransactionInformationNativeCurrency
  children?: ReactNode
}

const transactionRecipe = cva({
  base: {
    width: '100%',
    minHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    maxWidth: 'page-compact',
    marginInline: 'auto',
    paddingInline: '5',
    paddingBlockEnd: '9'
  }
})

const requestSummaryRecipe = cva({
  base: {
    position: 'relative',
    minHeight: 'panel-header',
    paddingBlock: '4',
    paddingInline: '5'
  }
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

const chainBadgeRecipe = cva({
  base: {
    display: 'inline-flex',
    maxWidth: '50%',
    minHeight: 'button-compact',
    alignItems: 'center',
    gap: 'xsmall',
    paddingInline: '3',
    borderWidth: 'thin',
    borderStyle: 'solid',
    borderColor: 'border.subtle',
    borderRadius: 'pill',
    background: 'bg.control'
  }
})

const chainIconRecipe = cva({
  base: {
    width: 'icon-small',
    height: 'icon-small',
    display: 'grid',
    flexShrink: 0,
    placeItems: 'center',
    overflow: 'hidden',
    borderRadius: 'pill',
    color: 'action.primary',
    '& img': { width: '100%', height: '100%', objectFit: 'cover' }
  }
})

const controlsRecipe = cva({ base: { marginBlockStart: 'auto', paddingBlockStart: '4' } })

const sectionRecipe = cva({ base: { overflow: 'hidden' } })

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
      in: { amount: { color: 'status.success' } },
      out: { amount: { color: 'status.danger' } },
      neutral: { amount: { color: 'text.primary' } }
    }
  },
  defaultVariants: { direction: 'neutral' }
})

const calldataRecipe = cva({
  base: {
    display: 'block',
    width: '100%',
    overflowWrap: 'anywhere',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all'
  }
})

function AssetIcon({
  effect,
  imageCapability,
  nativeCurrency
}: {
  effect: TransactionInformationEffect
  imageCapability: TokenImageCapability
  nativeCurrency: TransactionInformationNativeCurrency
}) {
  const hydrationTarget = useRef<HTMLSpanElement>(null)
  const icon = effect.logoURI || (effect.kind === 'native' ? persistedImageSource(nativeCurrency.image) : '')
  const iconSource = imageSource(icon)
  const symbol = (effect.symbol || '?').trim() || '?'
  const styles = effectRecipe({ direction: 'neutral' })

  useTokenImageHydration(imageCapability, effect.tokenId, !!iconSource, hydrationTarget)

  return (
    <span
      className={styles.icon}
      data-effect-icon-direction='neutral'
      data-testid='asset-icon'
      ref={hydrationTarget}
    >
      {iconSource ? (
        <Image alt={`${symbol} token`} source={iconSource} />
      ) : effect.kind === 'native' && symbol.toUpperCase() === 'ETH' ? (
        <Icon name='ethereum' size='small' />
      ) : (
        <Text align='center' truncate variant='microCode'>
          {symbol}
        </Text>
      )}
    </span>
  )
}

function TransactionEffects({
  effects,
  emptyText,
  notice,
  imageCapability,
  nativeCurrency,
  networkName,
  networkIcon
}: {
  effects: TransactionInformationEffect[]
  emptyText: ReactNode
  notice?: ReactNode
  imageCapability: TokenImageCapability
  nativeCurrency: TransactionInformationNativeCurrency
  networkName: ReactNode
  networkIcon?: string
}) {
  const chainIcon = imageSource(networkIcon)

  return (
    <Surface padding='none' radius='card' tone='card'>
      <section aria-label='Transaction effects' className={sectionRecipe()}>
        <div className={sectionHeaderRecipe()}>
          <Inline align='center' gap='small' grow justify='between'>
            <Text variant='sectionTitle'>Estimated changes</Text>
            <span className={chainBadgeRecipe()}>
              <Text shrink={false} tone='secondary' variant='caption'>
                on
              </Text>
              <span className={chainIconRecipe()}>
                {chainIcon ? <Image alt='' source={chainIcon} /> : <Icon name='ethereum' size='small' />}
              </span>
              <Text truncate variant='caption'>
                {networkName}
              </Text>
            </span>
          </Inline>
        </div>
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
                    <AssetIcon
                      effect={effect}
                      imageCapability={imageCapability}
                      nativeCurrency={nativeCurrency}
                    />
                    <span className={styles.meta}>
                      <Stack gap='none'>
                        <Text truncate variant='control'>
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
          ) : emptyText ? (
            <Text tone='secondary' variant='caption'>
              {emptyText}
            </Text>
          ) : null}
        </Surface>
        {notice ? (
          <Surface padding='small' radius='none' tone='card'>
            {notice}
          </Surface>
        ) : null}
      </section>
    </Surface>
  )
}

const wrappedValueRecipe = cva({ base: { minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' } })

function DetailValue({ value, wrap }: { value: ReactNode; wrap?: boolean }) {
  if (wrap)
    return (
      <span className={wrappedValueRecipe()}>
        <DetailValue value={value} />
      </span>
    )
  return typeof value === 'string' || typeof value === 'number' ? (
    <Text align='end' variant='code'>
      {value}
    </Text>
  ) : (
    value
  )
}

function DetailRow({
  label,
  value,
  onClick,
  actionLabel,
  wrap
}: TransactionInformationDetailRow & { wrap?: boolean }) {
  if (value === undefined || value === null || value === '') return null
  const content = (
    <Inline align='center' gap='small' justify='between'>
      <Text shrink={false} tone='secondary' variant='overline'>
        {label}
      </Text>
      <DetailValue value={value} wrap={wrap} />
    </Inline>
  )
  return onClick ? (
    <Button
      appearance='row'
      label={actionLabel || `${label}: ${String(value)}`}
      onPress={onClick}
      size='medium'
      width='full'
    >
      {content}
    </Button>
  ) : (
    <Surface padding='small' radius='small' tone='raised'>
      {content}
    </Surface>
  )
}

function CalldataDetails({
  calldata,
  clipboard
}: {
  calldata: TransactionInformationCalldata
  clipboard?: ClipboardCapability
}) {
  const [open, setOpen] = useState(false)

  return (
    <Stack gap='xsmall'>
      <Inline gap='xsmall' align='center'>
        <Button
          appearance='row'
          expanded={open}
          label={`${open ? 'Hide' : 'Show'} full calldata${calldata.digest ? ` for calldata digest ${calldata.digest}` : ''}`}
          onPress={() => setOpen((current) => !current)}
          size='medium'
          width='full'
        >
          <Stack gap='xsmall' grow>
            <Inline align='center' gap='small' justify='between'>
              <Text shrink={false} tone='secondary' variant='overline'>
                Calldata digest
              </Text>
              <Icon name={open ? 'chevronUp' : 'chevronDown'} size='small' tone='muted' />
            </Inline>
            <Text as='span' variant='microCode'>
              <code className={calldataRecipe()}>{calldata.digest || 'Digest unavailable'}</code>
            </Text>
          </Stack>
        </Button>
        {clipboard && calldata.digest ? (
          <CopyButton
            clipboard={clipboard}
            value={calldata.digest}
            label='Copy calldata digest'
            copiedLabel='Calldata digest copied'
          />
        ) : null}
      </Inline>
      {open ? (
        <Surface padding='small' radius='small' tone='raised'>
          <Stack gap='xsmall'>
            <Inline gap='xsmall' justify='between' align='center'>
              <Text tone='secondary' variant='overline'>
                Full calldata
              </Text>
              {clipboard ? (
                <CopyButton
                  clipboard={clipboard}
                  value={calldata.data}
                  label='Copy full calldata'
                  copiedLabel='Calldata copied'
                />
              ) : null}
            </Inline>
            <Text as='span' variant='microCode'>
              <code className={calldataRecipe()}>{calldata.data}</code>
            </Text>
          </Stack>
        </Surface>
      ) : null}
    </Stack>
  )
}

export default function TransactionInformation({
  imageCapability,
  originName,
  favicon,
  networkName,
  networkIcon,
  statusLabel,
  notice,
  statusDetails,
  actionTitle,
  actionNotice,
  beforeDetails,
  effects,
  effectsEmptyText,
  effectsNotice,
  details,
  wrapDetailValues,
  calldata,
  clipboard,
  verification,
  rawTransaction,
  nativeCurrency,
  children
}: TransactionInformationProps) {
  const [rawOpen, setRawOpen] = useState(false)
  return (
    <div className={transactionRecipe()}>
      <Stack gap='small' grow>
        <section aria-label='Request summary' className={requestSummaryRecipe()}>
          <Stack align='center' gap='xsmall'>
            <RequestOrigin originName={originName} favicon={favicon} />
            <Stack align='center' gap='xsmall'>
              <output className={badgeRecipe()}>
                <Text tone='accent' variant='overline'>
                  {statusLabel}
                </Text>
              </output>
              {statusDetails}
              {notice ? (
                <div role='alert'>
                  <Text tone='danger' variant='caption'>
                    {notice}
                  </Text>
                </div>
              ) : null}
            </Stack>
          </Stack>
        </section>

        {effects ? (
          <TransactionEffects
            effects={effects}
            emptyText={effectsEmptyText}
            notice={effectsNotice}
            imageCapability={imageCapability}
            nativeCurrency={nativeCurrency}
            networkIcon={networkIcon}
            networkName={networkName}
          />
        ) : null}

        {beforeDetails}

        <Surface padding='none' radius='card' tone='card'>
          <section aria-label='Transaction details' className={sectionRecipe()}>
            <div className={sectionHeaderRecipe()}>
              <Text variant={actionTitle ? 'sectionTitle' : 'overline'}>
                {actionTitle || 'Request details'}
              </Text>
            </div>
            <Surface padding='small' radius='none' tone='card'>
              <Stack gap='xsmall'>
                {actionNotice}
                {details.map((detail, index) => (
                  <DetailRow key={`${detail.label}-${index}`} {...detail} wrap={wrapDetailValues} />
                ))}
              </Stack>
            </Surface>
          </section>
        </Surface>

        {calldata || verification?.length || rawTransaction ? (
          <Surface padding='small' radius='card' tone='card'>
            <section aria-label='Verification details'>
              <Stack gap='xsmall'>
                <Text tone='secondary' variant='overline'>
                  Verification
                </Text>
                {verification?.map((detail, index) => (
                  <Surface key={`${detail.label}-${index}`} padding='small' radius='small' tone='raised'>
                    <Stack gap='xsmall'>
                      <Inline gap='xsmall' align='center' justify='between'>
                        <Text tone='secondary' variant='overline'>
                          {detail.label}
                        </Text>
                        {clipboard ? (
                          <CopyButton
                            clipboard={clipboard}
                            value={detail.value}
                            label={`Copy ${detail.label.toLowerCase()}`}
                            copiedLabel={`${detail.label} copied`}
                          />
                        ) : null}
                      </Inline>
                      <Text as='span' variant='microCode'>
                        <span className={calldataRecipe()}>{detail.value}</span>
                      </Text>
                    </Stack>
                  </Surface>
                ))}
                {calldata ? <CalldataDetails calldata={calldata} clipboard={clipboard} /> : null}
                {rawTransaction ? (
                  <Disclosure
                    label='Raw transaction'
                    open={rawOpen}
                    onToggle={() => setRawOpen((open) => !open)}
                  >
                    <Stack gap='xsmall'>
                      {clipboard ? (
                        <CopyButton
                          clipboard={clipboard}
                          value={rawTransaction}
                          label='Copy raw transaction'
                          copiedLabel='Raw transaction copied'
                        />
                      ) : null}
                      <Text as='span' variant='microCode'>
                        <code className={calldataRecipe()}>{rawTransaction}</code>
                      </Text>
                    </Stack>
                  </Disclosure>
                ) : null}
              </Stack>
            </section>
          </Surface>
        ) : null}

        {children ? <div className={controlsRecipe()}>{children}</div> : null}
      </Stack>
    </div>
  )
}
