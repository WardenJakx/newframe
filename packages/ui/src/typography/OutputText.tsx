import './text.css'
import { textClasses, type TypographyProps } from './textRecipe.js'

export type OutputTextProps = TypographyProps

export function OutputText({
  align,
  children,
  decorative = false,
  display,
  role,
  tone,
  truncate
}: OutputTextProps) {
  return (
    <output
      aria-hidden={decorative || undefined}
      className={textClasses({ align, display, role, tone, truncate })}
    >
      {children}
    </output>
  )
}
