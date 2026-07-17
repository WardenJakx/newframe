import './text.css'
import { textClasses, type TypographyProps } from './textRecipe.js'

export type StrongTextProps = TypographyProps

export function StrongText({
  align,
  children,
  decorative = false,
  display,
  role,
  tone,
  truncate
}: StrongTextProps) {
  return (
    <strong
      aria-hidden={decorative || undefined}
      className={`${textClasses({ align, display, role, tone, truncate })} nf-text--strong`}
    >
      {children}
    </strong>
  )
}
