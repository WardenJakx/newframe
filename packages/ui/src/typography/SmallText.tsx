import './text.css'
import { textClasses, type TypographyProps } from './textRecipe.js'

export type SmallTextProps = TypographyProps

export function SmallText({
  align,
  children,
  decorative = false,
  display,
  role,
  tone,
  truncate
}: SmallTextProps) {
  return (
    <small
      aria-hidden={decorative || undefined}
      className={textClasses({ align, display, role, tone, truncate })}
    >
      {children}
    </small>
  )
}
