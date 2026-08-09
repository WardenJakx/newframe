const timeFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' })

type EnsOverviewProps = {
  type: string
  data: {
    name?: string
    duration?: number
    tokenId?: string
    from?: string
    to?: string
    operator?: string
  }
}

function formatTime(amount: number, unit: string) {
  return `for ${amount} ${unit}${amount > 1 ? 's' : ''}`
}

function formatDuration(duration: number) {
  if (duration < 60) return 'for < 1 minute'
  if (duration < 3600) return formatTime(Math.floor(duration / 60), 'minute')
  if (duration < 3600 * 24) return formatTime(Math.floor(duration / 3600), 'hour')

  const endDate = new Date()
  endDate.setSeconds(endDate.getSeconds() + duration)

  return `until ${timeFormat.format(endDate)}`
}

const EnsOverview = ({ type, data }: EnsOverviewProps) => {
  const line = (value: string | undefined, emphasis = false) => (
    <Text
      align='center'
      tone={emphasis ? 'primary' : 'secondary'}
      variant={emphasis ? 'heading' : 'supporting'}
    >
      {value}
    </Text>
  )

  if (type === 'commit') {
    return line('Submitting ENS Commitment')
  }

  if (type === 'register') {
    return (
      <Stack align='center' gap='xsmall'>
        {line('Registering ENS Name')}
        {line(data.name, true)}
        {line(formatDuration(data.duration || 0))}
      </Stack>
    )
  }

  if (type === 'renew') {
    return (
      <Stack align='center' gap='xsmall'>
        {line('Renewing ENS Name')}
        {line(data.name, true)}
        {line(formatDuration(data.duration || 0))}
      </Stack>
    )
  }

  if (type === 'transfer') {
    const { name, tokenId, from, to } = data
    const display = name || tokenId

    return (
      <Stack align='center' gap='xsmall'>
        {line(`Transferring ENS Name${name ? '' : ' with token id'}`)}
        {line(display, true)}
        {line('from')}
        {line(from)}
        {line('to')}
        {line(to)}
      </Stack>
    )
  }

  if (type === 'approve') {
    const { operator, name } = data

    return (
      <Stack align='center' gap='xsmall'>
        {line('Granting approval to')}
        {line(operator)}
        {line('as an approved operator for')}
        {line(name, true)}
      </Stack>
    )
  }
}

export default EnsOverview
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
