import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'

export const textRecipe = cva('nf-text', {
  variants: {
    role: {
      body: 'nf-text--body',
      label: 'nf-text--label',
      detail: 'nf-text--detail',
      code: 'nf-text--code',
      title: 'nf-text--title',
      pageTitle: 'nf-text--page-title',
      sectionTitle: 'nf-text--section-title',
      heading: 'nf-text--heading',
      control: 'nf-text--control',
      action: 'nf-text--action',
      compactAction: 'nf-text--compact-action',
      fieldLabel: 'nf-text--field-label',
      supporting: 'nf-text--supporting',
      caption: 'nf-text--caption',
      micro: 'nf-text--micro',
      amount: 'nf-text--amount',
      output: 'nf-text--output',
      numeric: 'nf-text--numeric'
    },
    tone: {
      primary: 'nf-text--primary',
      secondary: 'nf-text--secondary',
      muted: 'nf-text--muted',
      disabled: 'nf-text--disabled',
      accent: 'nf-text--accent',
      success: 'nf-text--success',
      danger: 'nf-text--danger',
      warning: 'nf-text--warning',
      special: 'nf-text--special',
      inverse: 'nf-text--inverse'
    },
    align: {
      start: 'nf-text--align-start',
      center: 'nf-text--align-center',
      end: 'nf-text--align-end'
    },
    display: {
      block: 'nf-text--block',
      inline: 'nf-text--inline'
    },
    truncate: {
      true: 'nf-text--truncate',
      false: null
    }
  },
  defaultVariants: {
    align: 'start',
    display: 'block',
    role: 'body',
    tone: 'primary',
    truncate: false
  }
})

export type TextRecipeProps = VariantProps<typeof textRecipe>

export type TypographyProps = TextRecipeProps & {
  children: ReactNode
  decorative?: boolean
}

export function textClasses(props: TextRecipeProps) {
  return textRecipe(props)
}
