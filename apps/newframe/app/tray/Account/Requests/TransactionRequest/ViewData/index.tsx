import { IconButton } from '@newframe/ui/icon-button'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import link from '../../../../../../resources/link'
import { DetailRow } from '../../../../../../resources/Components/DetailRow'
import type { TransactionRequest } from '../../../../../../main/accounts/types'
import { cva } from '../../../../../../resources/styled-system/css/cva.js'

type TxJsonValue = string | number
type TxJson = Record<string, TxJsonValue>
type TxViewRequest = TransactionRequest & {
  payload: TransactionRequest['payload'] & { nonce?: string }
}

type NonceValueProps = {
  req: TxViewRequest
  nonce: TxJsonValue
}

type SimpleTxJSONProps = {
  json: TxJson
  req: TxViewRequest
}

type ViewDataProps = {
  req: TxViewRequest
}

const viewDataRecipe = cva({
  base: {
    width: '100%',
    maxWidth: 'page-compact',
    marginInline: 'auto',
    paddingInline: '5',
    paddingBlockEnd: '9'
  }
})

const txFieldPriority = [
  'chainId',
  'nonce',
  'value',
  'data',
  'to',
  'from',
  'gasLimit',
  'gasPrice',
  'maxFeePerGas',
  'maxPriorityFeePerGas'
]

const nonceHasBeenChanged = (req: TxViewRequest) => {
  return req.data.nonce && req.payload.nonce !== req.data.nonce
}

const NonceValue = ({ req, nonce }: NonceValueProps) => {
  return (
    <Stack align='center' direction='row' gap='xsmall' justify='end'>
      <Text variant='numeric'>{nonce}</Text>
      <IconButton
        icon='chevronDown'
        label='Lower nonce'
        onPress={() => {
          void link.executeCommand({
            type: 'transaction.nonce-adjust',
            requestId: req.handlerId,
            direction: -1
          })
        }}
        size='small'
      />
      <IconButton
        icon='chevronUp'
        label='Raise nonce'
        onPress={() => {
          void link.executeCommand({
            type: 'transaction.nonce-adjust',
            requestId: req.handlerId,
            direction: 1
          })
        }}
        size='small'
      />
      {nonceHasBeenChanged(req) && (
        <IconButton
          icon='sync'
          label='Reset nonce'
          onPress={() => {
            void link.executeCommand({
              type: 'transaction.nonce-reset',
              requestId: req.handlerId
            })
          }}
          size='small'
        />
      )}
    </Stack>
  )
}

const SimpleTxJSON = ({ json, req }: SimpleTxJSONProps) => {
  return (
    <Stack gap='none'>
      {Object.keys(json)
        .filter((f) => {
          return txFieldPriority.indexOf(f) !== -1
        })
        .sort((a, b) => {
          const aIndex = txFieldPriority.indexOf(a)
          const bIndex = txFieldPriority.indexOf(b)
          return aIndex > bIndex ? 1 : aIndex < bIndex ? -1 : 0
        })
        .map((key, o) => {
          const value =
            key === 'nonce' ? (
              <NonceValue nonce={json[key]} req={req} />
            ) : (
              <Text align='end' variant='code'>
                {json[key]}
              </Text>
            )

          return (
            <DetailRow
              code
              key={key + o}
              label={key.replace(/([A-Z])/g, ' $1').trim()}
              labelVariant='overline'
              value={value}
            />
          )
        })}
    </Stack>
  )
}

const decodeRawTx = (tx: Record<string, unknown>): TxJson => {
  const decodeTx: TxJson = {}
  Object.keys(tx).forEach((key) => {
    const value = tx[key]
    if (typeof value === 'string' && value && !value.startsWith('0x')) {
      decodeTx[key] = value
    } else if (
      ['chainId', 'value', 'nonce', 'gasLimit', 'gasPrice', 'maxFeePerGas', 'maxPriorityFeePerGas'].includes(
        key
      )
    ) {
      try {
        // convert these keys to ints
        decodeTx[key] = typeof value === 'string' ? parseInt(value, 16) : Number(value)
      } catch (e) {
        decodeTx[key] = String(value ?? '')
      }
    } else {
      decodeTx[key] = typeof value === 'number' ? value : String(value ?? '')
    }
  })
  return decodeTx
}

export default function ViewData({ req }: ViewDataProps) {
  const { data } = req
  const tx = { nonce: 'TBD', ...data }

  return (
    <div className={viewDataRecipe()}>
      <Stack gap='small'>
        <Text tone='muted' variant='sectionTitle'>
          Raw Transaction
        </Text>
        <SimpleTxJSON json={decodeRawTx(tx as unknown as Record<string, unknown>)} req={req} />
      </Stack>
    </div>
  )
}
