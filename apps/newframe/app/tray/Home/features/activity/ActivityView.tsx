import { Button } from '@newframe/ui/button'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import StatusGlyph from '../../../../../resources/Components/StatusGlyph'
import { timestamp } from '../../StatusNotifications'
import { ChainIcon } from '../../components/ChainIcon'
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
  if (!activity.length)
    return (
      <Text align='center' tone='disabled' variant='overline'>
        No Activity Yet
      </Text>
    )

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
          <Button
            key={record.id}
            appearance='selectionOption'
            label={`${title} ${status}`}
            onPress={() => onOpen(record.id)}
            width='full'
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
            <Stack gap='xsmall' grow>
              <Text truncate variant='label'>
                {title}
              </Text>
              <Stack direction='row' gap='xsmall'>
                <Text tone='secondary' truncate variant='supporting'>
                  {subtitle}
                </Text>
                {record.hash ? (
                  <Text tone='muted' variant='code'>
                    {shortAddress(record.hash)}
                  </Text>
                ) : null}
              </Stack>
            </Stack>
            <Stack align='end' gap='xsmall'>
              <Text
                tone={
                  record.status === 'succeeded'
                    ? 'success'
                    : record.status === 'reverted'
                      ? 'danger'
                      : 'warning'
                }
                variant='supporting'
              >
                {status}
              </Text>
              <Text tone='muted' variant='caption'>
                {submitted}
              </Text>
            </Stack>
          </Button>
        )
      })}
    </div>
  )
}
