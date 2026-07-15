import React from 'react'
import svg from '../../../../../../resources/svg'
import link from '../../../../../../resources/link'

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

const nonceHasBeenChanged = (req: any) => {
  return req.data.nonce && req.payload.nonce !== req.data.nonce
}

const NonceValue = ({ req, nonce }: any) => {
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

const TextValue = ({ value }: any) => <span>{value}</span>

const SimpleTxJSON = ({ json, req }: any) => {
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

const decodeRawTx = (tx: any) => {
  const decodeTx: any = {}
  Object.keys(tx).forEach((key) => {
    if (tx[key] && !tx[key].startsWith('0x')) {
      decodeTx[key] = tx[key]
    } else if (
      ['chainId', 'value', 'nonce', 'gasLimit', 'gasPrice', 'maxFeePerGas', 'maxPriorityFeePerGas'].includes(
        key
      )
    ) {
      try {
        // convert these keys to ints
        decodeTx[key] = parseInt(tx[key], 16)
      } catch (e) {
        decodeTx[key] = tx[key]
      }
    } else {
      decodeTx[key] = tx[key]
    }
  })
  return decodeTx
}

export default function ViewData({ req }: any) {
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
        <SimpleTxJSON json={decodeRawTx(tx)} req={req} />
      </div>
    </div>
  )
}
