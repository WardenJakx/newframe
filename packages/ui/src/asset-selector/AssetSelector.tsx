import { cva } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ImgHTMLAttributes } from 'react'

import './asset-selector.css'

const assetSelectorVariantNames = [
  'chainTokenIcon',
  'chainTokenIconChainBadge',
  'chainTokenIconChainDot',
  'chainTokenIconChainGlyph',
  'chainTokenIconInner',
  'chainTokenIconMd',
  'chainTokenIconSm',
  'chainTokenIconSymbol',
  'tokenOptionRow',
  'tokenOptionRowAmount',
  'tokenOptionRowNotional',
  'tokenOptionRowRight',
  'tokenOptionRowRightSubLabel',
  'tokenOptionRowRightSubLabelDown',
  'tokenOptionRowRightSubLabelUp',
  'tokenOptionRowSymbol',
  'tokenOptionRowText',
  'tokenSelector',
  'tokenSelectorChevron',
  'tokenSelectorFooter',
  'tokenSelectorListbox',
  'tokenSelectorMenu',
  'tokenSelectorOption',
  'tokenSelectorOptionHighlighted',
  'tokenSelectorTrigger',
  'tokenSelectorTriggerDisabled',
  'tokenSelectorTriggerPlaceholder',
  'tokenSelectorTriggerSymbol'
] as const

export type AssetSelectorVariant = (typeof assetSelectorVariantNames)[number]

const variantClasses = Object.fromEntries(assetSelectorVariantNames.map((name) => [name, name])) as Record<
  AssetSelectorVariant,
  string
>

const assetSelectorRecipe = cva('', { variants: { variant: variantClasses } })

type VariantProps = {
  variants?: AssetSelectorVariant | readonly AssetSelectorVariant[]
}

function assetSelectorClasses(variants: VariantProps['variants']) {
  const values = Array.isArray(variants) ? variants : variants ? [variants] : []
  return values.map((variant) => assetSelectorRecipe({ variant })).join(' ') || undefined
}

type StrictHtmlProps<T> = Omit<T, 'className' | 'style' | 'color'>

export type AssetSelectorPanelProps = StrictHtmlProps<HTMLAttributes<HTMLDivElement>> & VariantProps

export const AssetSelectorPanel = forwardRef<HTMLDivElement, AssetSelectorPanelProps>(
  function AssetSelectorPanel({ variants, ...props }, ref) {
    return <div {...props} className={assetSelectorClasses(variants)} ref={ref} />
  }
)

export type AssetSelectorTextProps = StrictHtmlProps<HTMLAttributes<HTMLSpanElement>> & VariantProps

export function AssetSelectorText({ variants, ...props }: AssetSelectorTextProps) {
  return <span {...props} className={assetSelectorClasses(variants)} />
}

export type AssetSelectorButtonProps = StrictHtmlProps<ButtonHTMLAttributes<HTMLButtonElement>> & VariantProps

export function AssetSelectorButton({ type = 'button', variants, ...props }: AssetSelectorButtonProps) {
  return <button {...props} className={assetSelectorClasses(variants)} type={type} />
}

export type AssetSelectorImageProps = StrictHtmlProps<ImgHTMLAttributes<HTMLImageElement>> & VariantProps

export function AssetSelectorImage({ alt, variants, ...props }: AssetSelectorImageProps) {
  return <img {...props} alt={alt} className={assetSelectorClasses(variants)} />
}
