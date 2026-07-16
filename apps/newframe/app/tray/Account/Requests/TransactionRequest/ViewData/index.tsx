import svg from '../../../../../../resources/svg'
import link from '../../../../../../resources/link'
import type { TransactionRequest } from '../../../../../../main/accounts/types'

type TxJsonValue = string | number
type TxJson = Record<string, TxJsonValue>
type TxViewRequest = TransactionRequest & {
  payload: TransactionRequest['payload'] & { nonce?: string }
}

type NonceValueProps = {
  req: TxViewRequest
  nonce: TxJsonValue
}

type TextValueProps = {
  value: TxJsonValue
}

type SimpleTxJSONProps = {
  json: TxJson
  req: TxViewRequest
}

type ViewDataProps = {
  req: TxViewRequest
}

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
    <>
      <div style={{ width: '24px' }}>{nonce}</div>
      <div className='txNonceControl'>
        <div
          className='txNonceButton txNonceButtonLower'
          onMouseDown={() => {
            void link.executeCommand({
              type: 'transaction.nonce-adjust',
              requestId: req.handlerId,
              direction: -1
            })
          }}
        >
          {svg.octicon('chevron-down', { height: 14 })}
        </div>
        <div
          className='txNonceButton txNonceButtonRaise'
          onMouseDown={() => {
            void link.executeCommand({
              type: 'transaction.nonce-adjust',
              requestId: req.handlerId,
              direction: 1
            })
          }}
        >
          {svg.octicon('chevron-up', { height: 14 })}
        </div>
        {nonceHasBeenChanged(req) && (
          <div
            className='txNonceButton txNonceButtonReset'
            onMouseDown={() => {
              void link.executeCommand({
                type: 'transaction.nonce-reset',
                requestId: req.handlerId
              })
            }}
          >
            {svg.octicon('sync', { height: 14 })}
          </div>
        )}
      </div>
    </>
  )
}

const TextValue = ({ value }: TextValueProps) => <span className='traySpan'>{value}</span>

const SimpleTxJSON = ({ json, req }: SimpleTxJSONProps) => {
  return (
    <div className='simpleJson'>
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
            key === 'nonce' ? <NonceValue nonce={json[key]} req={req} /> : <TextValue value={json[key]} />

          return (
            <div key={key + o} className='simpleJsonChild'>
              <div className=' simpleJsonKey simpleJsonKeyTx'>{key.replace(/([A-Z])/g, ' $1').trim()}</div>
              <div className='simpleJsonValue'>{value}</div>
            </div>
          )
        })}
    </div>
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
    <div className='accountViewScroll cardShow'>
      {/* <div className='txViewData'>
          <div className='txViewDataHeader'>{'Decoded Data'}</div>
          <DecodedData req={req} />
        </div> */}
      <div className='txViewData'>
        <div className='txViewDataHeader'>{'Raw Transaction'}</div>
        <SimpleTxJSON json={decodeRawTx(tx as unknown as Record<string, unknown>)} req={req} />
      </div>
    </div>
  )
}
