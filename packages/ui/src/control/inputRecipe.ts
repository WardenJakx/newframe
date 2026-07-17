import { cva, type VariantProps } from 'class-variance-authority'

export const inputRecipe = cva('nf-input', {
  variants: {
    appearance: {
      plain: 'nf-input--plain nf-text--supporting',
      control: 'nf-input--control nf-text--supporting',
      amount: 'nf-input--amount nf-text--amount',
      numeric: 'nf-input--numeric nf-text--numeric'
    },
    align: {
      start: 'nf-input--start',
      end: 'nf-input--end'
    },
    invalid: {
      true: 'nf-input--invalid',
      false: null
    }
  },
  defaultVariants: {
    align: 'start',
    appearance: 'control',
    invalid: false
  }
})

export type InputRecipeProps = VariantProps<typeof inputRecipe>
