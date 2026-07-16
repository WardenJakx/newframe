import React from 'react'

import { chainColorValue } from '../../colors'

const RequestHeader = ({
  chain,
  children,
  chainColor
}: {
  chain: string
  children?: React.ReactNode
  chainColor: string
}) => (
  <div className='_txDescriptionSummary'>
    {children}
    <div className='_txDescriptionSummaryTag' style={{ color: chainColorValue(chainColor) }}>
      {`on ${chain}`}
    </div>
  </div>
)

export default RequestHeader
