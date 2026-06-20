import React from 'react'

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
    <div className='_txDescriptionSummaryTag' style={{ color: `var(--${chainColor})` }}>
      {`on ${chain}`}
    </div>
  </div>
)

export default RequestHeader
