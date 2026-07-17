import './media.css'

export type StatusDotProps = {
  size?: 'small' | 'medium'
  tone?: 'accent' | 'danger' | 'neutral' | 'success' | 'warning'
}

export function StatusDot({ size = 'medium', tone = 'accent' }: StatusDotProps) {
  return <span aria-hidden='true' className={`nf-status-dot nf-status-dot--${size}`} data-tone={tone} />
}
