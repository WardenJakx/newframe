import { Icon } from '@newframe/ui/icon'
import { Select } from '@newframe/ui/select'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { useState } from 'react'

import { cva } from '../../../../generated/styled-system/css/cva.js'
import type { SignatureHistoryItem } from '../domain/state/signatureHistory.js'

type SignatureHistoryAccount = {
  id: string
  label: string
  address: string
}

export type SignatureHistoryTabProps = {
  accounts: readonly SignatureHistoryAccount[]
  onSelectAccount: (accountId: string) => void
  selectedAccountId: string
  signatures: readonly SignatureHistoryItem[]
}

const cardRecipe = cva({ base: { overflow: 'hidden', borderRadius: 'control' } })
const rowRecipe = cva({
  base: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '4',
    padding: '4',
    border: 0,
    background: 'transparent',
    color: 'text.primary',
    cursor: 'pointer',
    textAlign: 'left',
    _hover: { background: 'bg.hover' },
    _focusVisible: {
      outlineWidth: 'focus',
      outlineStyle: 'solid',
      outlineColor: 'border.focus',
      outlineOffset: 'focus-outline-offset'
    }
  }
})
const originRecipe = cva({
  base: {
    width: 'field',
    height: 'field',
    flex: 'none',
    display: 'grid',
    placeItems: 'center',
    borderRadius: 'control',
    background: 'action.primary.subtle',
    color: 'action.primary'
  }
})
const contentRecipe = cva({ base: { minWidth: 0, flex: 1 } })
const detailsRecipe = cva({
  base: {
    padding: '4',
    paddingBlockStart: '2',
    borderBlockStartWidth: 'thin',
    borderBlockStartStyle: 'solid',
    borderBlockStartColor: 'border.subtle'
  }
})
const valueRecipe = cva({ base: { margin: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' } })
const emptyRecipe = cva({ base: { paddingBlock: '9', textAlign: 'center' } })

const kindLabel: Record<SignatureHistoryItem['kind'], string> = {
  message: 'Message',
  'typed-data': 'Typed data',
  'sign-in': 'Sign-in',
  authorization: 'Authorization'
}

function shortAddress(address: string) {
  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address
}

function signedAtLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }).format(date)
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap='xsmall'>
      <Text tone='muted' variant='overline'>
        {label}
      </Text>
      <pre className={valueRecipe()}>
        <Text variant='code'>{value}</Text>
      </pre>
    </Stack>
  )
}

function SignatureRow({ item }: { item: SignatureHistoryItem }) {
  const [open, setOpen] = useState(false)
  const detailsId = `signature-details-${item.id}`

  return (
    <div className={cardRecipe()}>
      <Surface border='subtle' padding='none' radius='control' tone='control'>
        <button
          aria-controls={detailsId}
          aria-expanded={open}
          className={rowRecipe()}
          onClick={() => setOpen((current) => !current)}
          type='button'
        >
          <span className={originRecipe()}>
            <Icon name='window' size='small' />
          </span>
          <span className={contentRecipe()}>
            <Stack gap='xsmall'>
              <Text truncate variant='label'>
                {item.origin}
              </Text>
              <Text tone='secondary' truncate variant='caption'>
                {kindLabel[item.kind]} · {item.summary}
              </Text>
            </Stack>
          </span>
          <Stack align='end' gap='xsmall'>
            <Text tone='muted' variant='micro'>
              {signedAtLabel(item.signedAt)}
            </Text>
            <Icon name={open ? 'chevronUp' : 'chevronDown'} size='small' tone='muted' />
          </Stack>
        </button>
        {open ? (
          <div className={detailsRecipe()} id={detailsId}>
            <Stack gap='medium'>
              {item.network ? <Detail label='Network' value={item.network} /> : null}
              <Detail label='Signed content' value={item.message} />
              <Detail label='Signature' value={item.signature} />
            </Stack>
          </div>
        ) : null}
      </Surface>
    </div>
  )
}

export function SignatureHistoryTab({
  accounts,
  onSelectAccount,
  selectedAccountId,
  signatures
}: SignatureHistoryTabProps) {
  const account = accounts.find((item) => item.id === selectedAccountId)
  const recent = signatures
    .filter((item) => item.accountId === selectedAccountId)
    .toSorted((a, b) => b.signedAt.localeCompare(a.signedAt))

  return (
    <Stack gap='large'>
      <Stack gap='small'>
        <Text tone='muted' variant='overline'>
          Signing account
        </Text>
        <Select
          label='Signing account'
          onValueChange={onSelectAccount}
          options={accounts.map((item) => ({
            label: `${item.label} (${shortAddress(item.address)})`,
            value: item.id
          }))}
          value={selectedAccountId}
        />
        {account ? (
          <Text tone='muted' variant='code'>
            {shortAddress(account.address)}
          </Text>
        ) : null}
      </Stack>

      <Stack gap='small'>
        <Stack align='center' direction='row' justify='between'>
          <Text tone='muted' variant='overline'>
            Recent signatures
          </Text>
          <Text tone='muted' variant='caption'>
            {recent.length} {recent.length === 1 ? 'signature' : 'signatures'}
          </Text>
        </Stack>
        {recent.length ? (
          recent.map((item) => <SignatureRow item={item} key={item.id} />)
        ) : (
          <Surface border='subtle' padding='medium' radius='card' tone='card'>
            <div className={emptyRecipe()}>
              <Stack align='center' gap='small'>
                <Icon name='inbox' size='large' tone='muted' />
                <Text variant='label'>No signatures yet</Text>
                <Text tone='muted' variant='supporting'>
                  Signed messages for this account will appear here.
                </Text>
              </Stack>
            </div>
          </Surface>
        )}
      </Stack>
    </Stack>
  )
}
