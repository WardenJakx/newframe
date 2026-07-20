import { Stack, type StackProps } from './Stack.js'

export type InlineProps = Omit<StackProps, 'direction' | 'equal'>

export function Inline({ align, children, decorative = false, gap, grow, justify, wrap }: InlineProps) {
  return (
    <Stack
      align={align}
      decorative={decorative}
      direction='row'
      gap={gap}
      grow={grow}
      justify={justify}
      wrap={wrap}
    >
      {children}
    </Stack>
  )
}
