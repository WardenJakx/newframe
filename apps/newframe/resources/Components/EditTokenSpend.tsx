import { useState } from 'react'

import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Input } from '@newframe/ui/input'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Tabs } from '@newframe/ui/tabs'
import { Text } from '@newframe/ui/text'

import type { Identity } from '../../main/accounts/types'
import useCopiedMessage from '../Hooks/useCopiedMessage'
import type { SourceValue } from '../utils/displayValue'
import { formatUnits, max, parseUnits, toBigInt } from '../utils/numbers'
import Countdown from './Countdown'

type SpendMode = 'custom' | 'requested' | 'unlimited'

const isMax = (value: SourceValue) => toBigInt(value) === max

const getMode = (requestedAmount: SourceValue, amount: SourceValue): SpendMode => {
  if (requestedAmount === toBigInt(amount)) return 'requested'
  return isMax(amount) ? 'unlimited' : 'custom'
}

const isValidInput = (value: string, decimals: number) => {
  const strValue = value.toString()
  return (
    !Number.isNaN(Number(value)) &&
    Number(value) > 0 &&
    (!strValue.includes('.') || strValue.split('.')[1].length <= decimals)
  )
}

function ApprovalParty({ address, name }: { address: string; name?: string }) {
  const [showCopiedMessage, copyAddress] = useCopiedMessage(address)

  return (
    <Button appearance='row' label={`Copy ${name || address}`} onPress={copyAddress} width='full'>
      <Stack gap='xsmall' grow>
        {name ? (
          <Text truncate variant='label'>
            {name}
          </Text>
        ) : null}
        <Text tone={showCopiedMessage ? 'accent' : 'secondary'} truncate variant='code'>
          {showCopiedMessage ? 'Address Copied' : address}
        </Text>
      </Stack>
      <Icon name='copy' size='small' tone='muted' />
    </Button>
  )
}

export interface TokenSpendData {
  decimals?: number
  symbol?: string
  name?: string
  spender: Identity
  contract: Identity
  amount: SourceValue
}

interface EditTokenSpendProps {
  data: TokenSpendData
  updateRequest: (amount: string) => void
  requestedAmount: SourceValue
  deadline?: number
  canRevoke?: boolean
}

export default function EditTokenSpend({
  data,
  updateRequest,
  requestedAmount,
  deadline,
  canRevoke = false
}: EditTokenSpendProps) {
  const { decimals = 0, symbol = '???', name = 'Unknown Token', spender, contract, amount } = data
  const toDecimal = (baseAmount: SourceValue) => formatUnits(toBigInt(baseAmount) ?? 0n, decimals)
  const fromDecimal = (decimalAmount: string) => (parseUnits(decimalAmount, decimals) ?? 0n).toString()
  const [mode, setMode] = useState<SpendMode>(getMode(requestedAmount, amount))
  const [custom, setCustom] = useState(() => toDecimal(amount))
  const inputLock = !data.symbol || !data.name || !data.decimals
  const isRevoke = canRevoke && toBigInt(amount) === 0n
  const customChanged = mode === 'custom' && toBigInt(amount) !== toBigInt(fromDecimal(custom))

  const applyRequested = () => {
    setCustom(toDecimal(requestedAmount))
    setMode('requested')
    updateRequest(requestedAmount.toString())
  }
  const applyUnlimited = () => {
    setMode('unlimited')
    updateRequest(max.toString())
  }
  const applyCustom = () => {
    setMode('custom')
    setCustom('')
  }
  const submitCustom = () => {
    if (!custom) applyRequested()
    else updateRequest(fromDecimal(custom))
  }
  const selectMode = (next: SpendMode) => {
    if (next === 'requested') applyRequested()
    else if (next === 'unlimited') applyUnlimited()
    else applyCustom()
  }

  return (
    <Stack gap='medium'>
      <Text tone='muted' variant='overline'>
        Token approval details
      </Text>
      <Surface padding='small' radius='card'>
        <Stack gap='small'>
          <ApprovalParty address={spender.address} name={spender.ens} />
          <Text align='center' tone='danger' variant='overline'>
            {isRevoke ? 'Revoke approval to spend' : 'Grant approval to spend'}
          </Text>
          <ApprovalParty address={contract.address} name={name} />
          {deadline ? <Countdown end={deadline} title='Permission Expires in' /> : null}
        </Stack>
      </Surface>

      <Surface padding='medium' radius='card'>
        <Stack gap='small'>
          <Text align='center' tone='secondary' variant='overline'>
            {symbol}
          </Text>
          {mode === 'custom' ? (
            <Stack align='center' direction='row' gap='small'>
              <Input
                appearance='amount'
                autoFocus
                label='Custom Amount'
                onSubmit={submitCustom}
                onValueChange={(value) => {
                  if (!value) setCustom('')
                  else if (isValidInput(value, decimals)) setCustom(value)
                }}
                value={custom}
              />
              <Button
                appearance={customChanged ? 'primary' : 'subtle'}
                disabled={!customChanged}
                label='Update approval amount'
                onPress={submitCustom}
                shape='pill'
                size='small'
              >
                {customChanged ? (
                  <Text variant='compactAction'>Update</Text>
                ) : (
                  <Icon name='check' size='small' />
                )}
              </Button>
            </Stack>
          ) : (
            <Button
              appearance='ghost'
              disabled={inputLock}
              label='Enter custom approval amount'
              onPress={applyCustom}
              width='full'
            >
              <Text align='center' variant='amount'>
                {isMax(amount) ? 'Unlimited' : toDecimal(amount)}
              </Text>
            </Button>
          )}
          <Text align='center' tone='muted' variant='caption'>
            Set Token Approval Spend Limit
          </Text>
          <Tabs
            items={(
              [
                { id: 'requested', label: 'Requested' },
                { id: 'unlimited', label: 'Unlimited' },
                ...(!inputLock ? [{ id: 'custom' as const, label: 'Custom' }] : [])
              ] as Array<{ id: SpendMode; label: string }>
            ).map((item) => ({ ...item, active: mode === item.id }))}
            label='Approval amount mode'
            onSelect={selectMode}
          />
        </Stack>
      </Surface>
    </Stack>
  )
}
