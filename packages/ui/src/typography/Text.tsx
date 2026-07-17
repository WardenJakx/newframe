import './text.css'
import { textClasses, type TypographyProps } from './textRecipe.js'

export type TextProps = TypographyProps

export function Text({ align, children, decorative = false, display, role, tone, truncate }: TextProps) {
  return (
    <span
      aria-hidden={decorative || undefined}
      className={textClasses({ align, display, role, tone, truncate })}
      data-tone={tone ?? undefined}
    >
      {children}
    </span>
  )
}
