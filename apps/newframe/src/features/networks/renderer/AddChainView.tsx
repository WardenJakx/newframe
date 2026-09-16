import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { useState } from 'react'

import { cva } from '../../../../generated/styled-system/css/cva.js'
import { TrayOverlay } from '../../../shared/renderer/ui/TrayOverlay'

const chainIconRecipe = cva({
  base: {
    width: '64px',
    height: '64px',
    display: 'grid',
    flex: 'none',
    placeItems: 'center',
    overflow: 'hidden',
    borderWidth: 'strong',
    borderStyle: 'solid',
    borderColor: 'border.strong',
    borderRadius: '50%',
    background: 'bg.control',
    color: 'action.primary',
    '& img': { width: '100%', height: '100%', objectFit: 'cover' },
    '& > span': { width: '13', height: '13' }
  }
})

const parameterRecipe = cva({
  base: {
    paddingInline: '5',
    paddingBlock: '4',
    borderBlockEndWidth: 'thin',
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: 'border.subtle',
    _last: { borderBlockEndWidth: 0 }
  }
})

const valueRecipe = cva({ base: { minWidth: 0, overflowWrap: 'anywhere' } })

export interface AddChainViewModel {
  explorer?: string
  icon?: string
  id?: number | string
  name?: string
  nativeCurrencyName?: string
  primaryRpc?: string
  secondaryRpc?: string
  symbol?: string
}

interface ChainParameter {
  label: string
  value: number | string
}

function displayChainId(value: number | string) {
  try {
    const id = BigInt(value)
    return `${id.toString()} (0x${id.toString(16)})`
  } catch {
    return String(value)
  }
}

function ChainIdentity({ chain }: { chain: AddChainViewModel }) {
  const [failedIcon, setFailedIcon] = useState('')
  const name = chain.name ?? 'Unknown chain'
  const showIcon = chain.icon && failedIcon !== chain.icon

  return (
    <Stack align='center' gap='small'>
      <span className={chainIconRecipe()}>
        {showIcon ? (
          <img alt='' onError={() => setFailedIcon(chain.icon ?? '')} src={chain.icon} />
        ) : (
          <Icon name='ethereum' />
        )}
      </span>
      <Stack align='center' gap='xsmall'>
        <Text align='center' as='h2' variant='heading'>
          {name}
        </Text>
        <Text align='center' tone='secondary' variant='supporting'>
          Review the settings before adding this chain to NewFrame.
        </Text>
      </Stack>
    </Stack>
  )
}

function ChainParameterRow({ label, value }: ChainParameter) {
  return (
    <div className={parameterRecipe()}>
      <Stack gap='xsmall'>
        <Text tone='secondary' variant='fieldLabel'>
          {label}
        </Text>
        <div className={valueRecipe()}>
          <Text variant='code'>{value}</Text>
        </div>
      </Stack>
    </div>
  )
}

function chainParameters(chain: AddChainViewModel): ChainParameter[] {
  const currency = [chain.nativeCurrencyName, chain.symbol ? `(${chain.symbol})` : '']
    .filter(Boolean)
    .join(' ')
  const candidates: Array<ChainParameter | null> = [
    chain.name ? { label: 'Network name', value: chain.name } : null,
    chain.id !== undefined && chain.id !== '' ? { label: 'Chain ID', value: displayChainId(chain.id) } : null,
    currency ? { label: 'Native currency', value: currency } : null,
    chain.primaryRpc ? { label: 'RPC URL', value: chain.primaryRpc } : null,
    chain.secondaryRpc ? { label: 'Secondary RPC', value: chain.secondaryRpc } : null,
    chain.explorer ? { label: 'Block explorer', value: chain.explorer } : null
  ]

  return candidates.filter((parameter): parameter is ChainParameter => parameter !== null)
}

export function AddChainView({
  chain,
  onApprove,
  onReject
}: {
  chain: AddChainViewModel
  onApprove: () => void
  onReject: () => void
}) {
  const parameters = chainParameters(chain)

  return (
    <TrayOverlay
      closeLabel='Back'
      footer={
        <Stack direction='row' equal gap='xsmall' grow>
          <Button appearance='danger' label='Reject chain' onPress={onReject} shape='pill' size='large'>
            <Text variant='action'>Reject</Text>
          </Button>
          <Button appearance='primary' label='Add chain' onPress={onApprove} shape='pill' size='large'>
            <Text tone='inverse' variant='action'>
              Add chain
            </Text>
          </Button>
        </Stack>
      }
      label='Add Chain'
      onClose={onReject}
      title='Add Chain'
    >
      <Stack gap='medium'>
        <ChainIdentity chain={chain} />
        <Stack gap='xsmall'>
          <Text as='h3' tone='secondary' variant='sectionTitle'>
            Network details
          </Text>
          <Surface border='subtle' padding='none' radius='card' tone='card'>
            {parameters.map((parameter) => (
              <ChainParameterRow key={parameter.label} {...parameter} />
            ))}
          </Surface>
        </Stack>
      </Stack>
    </TrayOverlay>
  )
}
