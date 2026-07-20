import { cva } from '../styled-system/css/cva.js'
import type { RecipeVariantProps } from '../styled-system/types/recipe.js'
import type { ReactNode } from 'react'

export const textRecipe = cva({
  base: { minWidth: 0 },
  variants: {
    variant: {
      body: { fontSize: 'body', fontWeight: 'regular' },
      label: {
        overflow: 'hidden',
        fontSize: 'label',
        fontWeight: 'medium',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      },
      detail: {
        overflow: 'hidden',
        fontSize: 'detail',
        fontWeight: 'regular',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      },
      code: { fontFamily: 'mono', fontSize: 'caption' },
      microCode: { fontFamily: 'mono', fontSize: 'micro' },
      title: {
        fontSize: 'label',
        fontWeight: 'medium',
        letterSpacing: 'title',
        textTransform: 'uppercase'
      },
      overline: {
        fontSize: 'detail',
        fontWeight: 'medium',
        textTransform: 'uppercase'
      },
      pageTitle: { fontSize: 'page-title', fontWeight: 'medium' },
      sectionTitle: { fontSize: 'control', fontWeight: 'medium' },
      heading: { fontSize: 'heading', fontWeight: 'medium' },
      control: { fontSize: 'control', fontWeight: 'medium' },
      action: { fontSize: 'label', fontWeight: 'bold' },
      compactAction: { fontSize: 'detail', fontWeight: 'bold' },
      fieldLabel: { fontSize: 'supporting', fontWeight: 'bold', whiteSpace: 'nowrap' },
      supporting: { fontSize: 'supporting', fontWeight: 'regular' },
      caption: { fontSize: 'caption', fontWeight: 'regular' },
      micro: { fontSize: 'micro', fontWeight: 'regular' },
      amount: { fontFamily: 'mono', fontSize: 'amount', fontWeight: 'medium' },
      displayAmount: { fontFamily: 'mono', fontSize: 'display', fontWeight: 'medium' },
      displayFraction: {
        fontFamily: 'mono',
        fontSize: 'display-fraction',
        fontWeight: 'regular'
      },
      output: { fontFamily: 'mono', fontSize: 'heading', fontWeight: 'bold' },
      numeric: { fontFamily: 'mono', fontSize: 'label', fontWeight: 'medium' }
    },
    tone: {
      primary: { color: 'text.primary' },
      secondary: { color: 'text.secondary' },
      muted: { color: 'text.muted' },
      disabled: { color: 'text.disabled' },
      accent: { color: 'action.primary' },
      success: { color: 'status.success' },
      danger: { color: 'status.danger' },
      warning: { color: 'status.warning' },
      special: { color: 'status.special' },
      inverse: { color: 'text.inverse' }
    },
    align: {
      start: { textAlign: 'start' },
      center: { textAlign: 'center' },
      end: { textAlign: 'end' }
    },
    display: {
      block: { display: 'block' },
      inline: { display: 'inline' }
    },
    emphasis: {
      normal: {},
      strong: { fontWeight: 'bold' }
    },
    truncate: {
      true: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      false: {}
    },
    shrink: {
      true: {},
      false: { flexShrink: 0 }
    }
  },
  defaultVariants: {
    align: 'start',
    display: 'block',
    emphasis: 'normal',
    variant: 'body',
    tone: 'primary',
    truncate: false,
    shrink: true
  }
})

export type TextRecipeProps = NonNullable<RecipeVariantProps<typeof textRecipe>>
export type TypographyProps = TextRecipeProps & { children: ReactNode; decorative?: boolean }

export type TextProps = TypographyProps & {
  as?: 'output' | 'small' | 'span' | 'strong'
}

export function Text({
  align,
  as = 'span',
  children,
  decorative = false,
  display,
  emphasis,
  shrink,
  tone,
  truncate,
  variant
}: TextProps) {
  const Component = as
  const resolvedEmphasis = as === 'strong' ? 'strong' : emphasis

  return (
    <Component
      aria-hidden={decorative || undefined}
      className={textRecipe({ align, display, emphasis: resolvedEmphasis, shrink, tone, truncate, variant })}
      data-tone={tone ?? undefined}
    >
      {children}
    </Component>
  )
}
