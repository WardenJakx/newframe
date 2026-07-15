import React from 'react'

import StatusGlyph from '../../../../../resources/Components/StatusGlyph'
import { timestamp } from '../../StatusNotifications'
import { ChainIcon } from '../../components/ChainIcon'
import { activateOnKeyboard } from '../../ui/keyboard'
import { activityGlyphState, transactionStatusLabel } from './activityModel'

const shortAddress = (address = '') =>
  address ? `${address.substring(0, 5)}…${address.substring(address.length - 4)}` : ''

export function ActivityView({
  activity,
  networks,
  networksMeta,
  onOpen
}: {
  activity: any[]
  networks: Record<string | number, any>
  networksMeta: Record<string | number, any>
  onOpen: (activityId: string) => void
}) {
  if (!activity.length) return <div className='t2EmptyState'>No Activity Yet</div>

  return (
    <div className='t2ActivityList'>
      {activity.map((record) => {
        const chainId = Number(record.chainId)
        const chain = networks[chainId] || {}
        const status = transactionStatusLabel(record.status)
        const submittedAt = timestamp(record.submittedAt, timestamp(record.updatedAt, 0))
        const submitted = submittedAt
          ? new Date(submittedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
          : ''
        const title = record.display?.title || 'Transaction'
        const subtitle = record.display?.subtitle || chain.name || `Chain ${chainId}`

        return (
          <div
            key={record.id}
            aria-label={`${title} ${status}`}
            className='t2ActivityRow cardShow'
            onClick={() => onOpen(record.id)}
            onKeyDown={(event) => activateOnKeyboard(event, () => onOpen(record.id))}
            role='button'
            tabIndex={0}
          >
            <div className='t2ActivityIconWrap'>
              <StatusGlyph state={activityGlyphState(record.status) as any} />
              <div className='t2ActivityChainBadge'>
                <ChainIcon
                  chainId={chainId}
                  glyphSize={10}
                  imageSize={16}
                  networks={networks}
                  networksMeta={networksMeta}
                />
              </div>
            </div>
            <div className='t2ActivityCopy'>
              <div className='t2ActivityTitle'>{title}</div>
              <div className='t2ActivitySubtitle'>
                <span>{subtitle}</span>
                {record.hash ? <span>{shortAddress(record.hash)}</span> : null}
              </div>
            </div>
            <div className='t2ActivityMeta'>
              <div className={`t2ActivityStatus t2ActivityStatus-${record.status}`}>{status}</div>
              <div className='t2ActivityTime'>{submitted}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
