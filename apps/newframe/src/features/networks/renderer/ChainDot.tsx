import { StatusDot } from '@newframe/ui/status-dot'

export type ChainDotProps = {
  color: string
  size?: 'medium' | 'small'
}

export function ChainDot({ color, size = 'small' }: ChainDotProps) {
  return <StatusDot color={color} size={size} />
}
