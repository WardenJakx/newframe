import { cva } from 'class-variance-authority'
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes
} from 'react'

import './side-panel.css'

const panelVariantNames = [
  'sendAccountIcon',
  'sendAmountInput',
  'sendApp',
  'sendBackButton',
  'sendBalance',
  'sendBody',
  'sendCard',
  'sendEmpty',
  'sendFiatValue',
  'sendFooter',
  'sendHeader',
  'sendHeaderSpacer',
  'sendInputRow',
  'sendInputToggle',
  'sendMessage',
  'sendMessageError',
  'sendProceedButton',
  'sendProceedButtonDisabled',
  'sendRecipientAddress',
  'sendRecipientCard',
  'sendRecipientCardSelected',
  'sendRecipientClear',
  'sendRecipientCopy',
  'sendRecipientMenu',
  'sendRecipientMenuTitle',
  'sendRecipientName',
  'sendRecipientNotice',
  'sendRecipientPill',
  'sendRecipientText',
  'sendSectionTitle',
  'sendTitle',
  'sendTokenCard',
  'sendTokenMain',
  'sendTokenMeta',
  'sendWalletAddress',
  'sendWalletCopy',
  'sendWalletInfo',
  'sendWalletName',
  'sendWalletRow',
  'tokenSelectorMore',
  'tradeAdvanced',
  'tradeAdvancedChevron',
  'tradeAdvancedChevronOpen',
  'tradeAdvancedPanel',
  'tradeAdvancedToggle',
  'tradeAmountInput',
  'tradeApp',
  'tradeAssetAmountRow',
  'tradeAssetCard',
  'tradeAssetCardEditable',
  'tradeAssetCardEditableBuy',
  'tradeAssetCardEditableSell',
  'tradeAssetCardHeader',
  'tradeAssetCardInvalid',
  'tradeBalanceRange',
  'tradeBalanceSlider',
  'tradeBalanceSliderBuy',
  'tradeBalanceSliderHeader',
  'tradeBalanceSliderSell',
  'tradeBalanceTicks',
  'tradeBody',
  'tradeDirectionSwitch',
  'tradeFooter',
  'tradeIntentBuy',
  'tradeIntentLine',
  'tradeIntentSell',
  'tradeOrderField',
  'tradeOrderFieldControl',
  'tradeOrderFieldInvalid',
  'tradeOrderFieldLabel',
  'tradeOrderFieldSuffix',
  'tradeOrderFields',
  'tradeOrderFieldsThree',
  'tradeOrderFieldsTrigger',
  'tradeOrderFieldsTwo',
  'tradeOrderHint',
  'tradeOrderOutput',
  'tradeOrderSection',
  'tradeOrderSectionTitle',
  'tradeOutputNote',
  'tradePrimaryButton',
  'tradePrimaryButtonDisabled',
  'tradeQuoteOutput',
  'tradeQuoteRows',
  'tradeQuoteSummary',
  'tradeQuoteWarning',
  'tradeRequiredMark',
  'tradeSettingInputInvalid',
  'tradeSettingRow',
  'tradeSettingStack',
  'tradeSlippageInput',
  'tradeSlippageInputInvalid',
  'tradeStep',
  'tradeStepDot',
  'tradeSteprequired',
  'tradeStepcomplete',
  'tradeSteperror',
  'tradeStepidle',
  'tradeSteppending',
  'tradeStepskipped',
  'tradeStepTracker',
  'tradeTab',
  'tradeTabActive',
  'tradeTabs',
  'tradeTabsWrap',
  'tradeTicket',
  'tradeTriggerKind',
  'tradeTriggerKindActive'
] as const

export type PanelVariant = (typeof panelVariantNames)[number]

const variantClasses = Object.fromEntries(panelVariantNames.map((name) => [name, name])) as Record<
  PanelVariant,
  string
>

const panelRecipe = cva('', { variants: { variant: variantClasses } })

type VariantProps = {
  variants?: PanelVariant | readonly PanelVariant[]
}

function panelClasses(variants: VariantProps['variants']) {
  const values = Array.isArray(variants) ? variants : variants ? [variants] : []
  return values.map((variant) => panelRecipe({ variant })).join(' ') || undefined
}

type StrictHtmlProps<T> = Omit<T, 'className' | 'style' | 'color'>

export type PanelProps = StrictHtmlProps<HTMLAttributes<HTMLDivElement>> & VariantProps

export const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel({ variants, ...props }, ref) {
  return <div {...props} className={panelClasses(variants)} ref={ref} />
})

export type PanelTextProps = StrictHtmlProps<HTMLAttributes<HTMLSpanElement>> & VariantProps

export function PanelText({ variants, ...props }: PanelTextProps) {
  return <span {...props} className={panelClasses(variants)} />
}

export type PanelStrongProps = StrictHtmlProps<HTMLAttributes<HTMLElement>> & VariantProps

export function PanelStrong({ variants, ...props }: PanelStrongProps) {
  return <strong {...props} className={panelClasses(variants)} />
}

export type PanelSmallProps = StrictHtmlProps<HTMLAttributes<HTMLElement>> & VariantProps

export function PanelSmall({ variants, ...props }: PanelSmallProps) {
  return <small {...props} className={panelClasses(variants)} />
}

export type PanelOutputProps = StrictHtmlProps<HTMLAttributes<HTMLOutputElement>> & VariantProps

export function PanelOutput({ variants, ...props }: PanelOutputProps) {
  return <output {...props} className={panelClasses(variants)} />
}

export type PanelButtonProps = StrictHtmlProps<ButtonHTMLAttributes<HTMLButtonElement>> & VariantProps

export const PanelButton = forwardRef<HTMLButtonElement, PanelButtonProps>(function PanelButton(
  { type = 'button', variants, ...props },
  ref
) {
  return <button {...props} className={panelClasses(variants)} ref={ref} type={type} />
})

export type PanelInputProps = StrictHtmlProps<InputHTMLAttributes<HTMLInputElement>> & VariantProps

export const PanelInput = forwardRef<HTMLInputElement, PanelInputProps>(function PanelInput(
  { variants, ...props },
  ref
) {
  return <input {...props} className={panelClasses(variants)} ref={ref} />
})

export type PanelLabelProps = StrictHtmlProps<LabelHTMLAttributes<HTMLLabelElement>> & VariantProps

export function PanelLabel({ variants, ...props }: PanelLabelProps) {
  return <label {...props} className={panelClasses(variants)} />
}

export type PanelSelectOption = {
  disabled?: boolean
  label: ReactNode
  value: string
}

export type PanelSelectProps = StrictHtmlProps<SelectHTMLAttributes<HTMLSelectElement>> &
  VariantProps & {
    options: readonly PanelSelectOption[]
  }

export function PanelSelect({ options, variants, ...props }: PanelSelectProps) {
  return (
    <select {...props} className={panelClasses(variants)}>
      {options.map((option) => (
        <option disabled={option.disabled} key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
