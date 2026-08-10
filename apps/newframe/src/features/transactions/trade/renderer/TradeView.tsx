import { Button } from '@newframe/ui/button'
import { Disclosure } from '@newframe/ui/disclosure'
import { Field } from '@newframe/ui/field'
import { Grid } from '@newframe/ui/grid'
import { Group } from '@newframe/ui/group'
import { IconButton } from '@newframe/ui/icon-button'
import { Input } from '@newframe/ui/input'
import { Select } from '@newframe/ui/select'
import { Stack } from '@newframe/ui/stack'
import { Spacer } from '@newframe/ui/spacer'
import { Surface } from '@newframe/ui/surface'
import { Tabs } from '@newframe/ui/tabs'
import { Text } from '@newframe/ui/text'
import { ToggleButton } from '@newframe/ui/toggle-button'

import { BalanceRange } from './ui/BalanceRange'
import { ProgressSteps } from './ui/ProgressSteps'
import { SidePanel } from '../../../../shared/renderer/ui/SidePanel/SidePanel'
import TokenSelector from '../../../../shared/renderer/ui/TokenSelector'
import { TOKEN_SELECTOR_ROWS_INCREMENT } from '../../../../shared/renderer/ui/tokenSelectorModel'
import {
  FLASH_LIMIT_ORDER_TYPE,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE,
  FLASH_TWAP_ORDER_TYPE
} from '../domain/constants'
import type { FlashOrderType } from '../domain/schemas'
import type { TradeOrderFields } from './tradeTransaction'
import type { TradeAssetViewModel, TradeViewEvents, TradeViewModel } from './tradeViewModel'
import type { TradeCapability } from './tradeService'

const durationInputs = [
  ['durationDays', 'days', 'Days', '0'],
  ['durationHours', 'hours', 'Hours', '1'],
  ['durationMinutes', 'minutes', 'Minutes', '0']
] as const

export function TradeView({
  capability,
  events,
  model
}: {
  capability: Pick<TradeCapability, 'hydrateTokenImage'>
  events: TradeViewEvents
  model: TradeViewModel
}) {
  const state = model.ticket
  const invalidTradeFields = model.validation.invalidFields

  const renderTradeTabs = () => {
    const orderType = state.orderType
    const tpSlActive = [FLASH_STOP_LOSS_ORDER_TYPE, FLASH_TAKE_PROFIT_ORDER_TYPE].includes(orderType)
    const tabs: { label: string; active: boolean; orderType: FlashOrderType }[] = [
      { label: 'Market', active: orderType === FLASH_MARKET_ORDER_TYPE, orderType: FLASH_MARKET_ORDER_TYPE },
      { label: 'Limit', active: orderType === FLASH_LIMIT_ORDER_TYPE, orderType: FLASH_LIMIT_ORDER_TYPE },
      { label: 'TWAP', active: orderType === FLASH_TWAP_ORDER_TYPE, orderType: FLASH_TWAP_ORDER_TYPE },
      {
        label: 'TP/SL',
        active: tpSlActive,
        orderType: tpSlActive ? orderType : FLASH_TAKE_PROFIT_ORDER_TYPE
      },
      { label: 'Stop', active: orderType === FLASH_STOP_ORDER_TYPE, orderType: FLASH_STOP_ORDER_TYPE }
    ]

    return (
      <Tabs
        label='Order type'
        items={tabs.map((tab) => ({ active: tab.active, id: tab.orderType, label: tab.label }))}
        onSelect={events.onOrderTypeChange}
      />
    )
  }

  const renderOrderInput = ({
    ariaLabel,
    field,
    inputMode = 'decimal',
    invalid = false,
    label,
    placeholder,
    required = false,
    suffix,
    vertical = false
  }: {
    ariaLabel: string
    field: Exclude<keyof TradeOrderFields, 'expireTime' | 'startTime' | 'timeInForce'>
    inputMode?: 'decimal' | 'numeric'
    invalid?: boolean
    label: string
    placeholder: string
    required?: boolean
    suffix?: string
    vertical?: boolean
  }) => {
    return (
      <Field
        key={field}
        invalid={invalid}
        label={label}
        required={required}
        suffix={suffix}
        vertical={vertical}
      >
        <Input
          align='end'
          appearance='plain'
          invalid={invalid}
          label={ariaLabel}
          inputMode={inputMode}
          onValueChange={(value) => events.onOrderFieldChange(field, value)}
          placeholder={placeholder}
          required={required}
          value={state[field]}
        />
      </Field>
    )
  }

  const renderTradeOrderFields = () => {
    if (state.orderType === FLASH_MARKET_ORDER_TYPE) return null

    if (state.orderType === FLASH_LIMIT_ORDER_TYPE) {
      return (
        <Grid columns='one' gap='medium'>
          {renderOrderInput({
            ariaLabel: 'Limit price',
            field: 'limitNotionalPrice',
            invalid: invalidTradeFields.limitPrice,
            label: `${state.target.symbol}/USD limit`,
            placeholder: '0.00',
            required: true,
            suffix: 'USD'
          })}
        </Grid>
      )
    }

    if (state.orderType === FLASH_TWAP_ORDER_TYPE) {
      return (
        <Surface border='subtle' padding='medium' radius='small' tone='card'>
          <Stack gap='medium'>
            <Text variant='supporting'>
              Duration{' '}
              <Text decorative display='inline' variant='supporting' tone='danger'>
                *
              </Text>
            </Text>
            <Grid columns='three' gap='medium' responsive>
              {durationInputs.map(([field, unit, label, placeholder]) =>
                renderOrderInput({
                  ariaLabel: `TWAP duration ${unit}`,
                  field,
                  inputMode: 'numeric',
                  invalid: invalidTradeFields.duration,
                  label,
                  placeholder,
                  vertical: true
                })
              )}
            </Grid>
            <Text variant='detail' tone='secondary'>
              Minimum 5 minutes · Maximum 30 days
            </Text>
            <Grid columns='two' gap='medium' responsive>
              {renderOrderInput({
                ariaLabel: 'TWAP limit price',
                field: 'limitNotionalPrice',
                invalid: invalidTradeFields.limitPrice,
                label: `${state.target.symbol}/USD limit`,
                placeholder: 'Market',
                suffix: 'USD',
                vertical: true
              })}
              <Field invalid={invalidTradeFields.startTime} label='Starts' vertical>
                <Input
                  invalid={invalidTradeFields.startTime}
                  label='TWAP start time'
                  min={state.minimumDateTime}
                  onValueChange={(value) => events.onOrderFieldChange('startTime', value)}
                  type='datetime-local'
                  value={state.startTime}
                />
              </Field>
            </Grid>
            <Text variant='detail' tone='secondary'>
              Leave start blank to begin immediately · limit is optional
            </Text>
          </Stack>
        </Surface>
      )
    }

    if (
      [FLASH_STOP_ORDER_TYPE, FLASH_STOP_LOSS_ORDER_TYPE, FLASH_TAKE_PROFIT_ORDER_TYPE].includes(
        state.orderType
      )
    ) {
      const stop = state.orderType === FLASH_STOP_ORDER_TYPE
      const takeProfit = state.orderType === FLASH_TAKE_PROFIT_ORDER_TYPE
      const name = stop ? 'Stop' : takeProfit ? 'Take-profit' : 'Stop-loss'
      const shortName = stop ? state.target.symbol + '/USD' : takeProfit ? 'TP' : 'SL'

      return (
        <Surface border='subtle' padding='medium' radius='small' tone='card'>
          <Stack gap='medium'>
            {!stop ? (
              <Group label='TP or SL'>
                <Surface padding='small' radius='small' tone='subtle'>
                  <Grid columns='two' gap='small'>
                    {(
                      [
                        ['Take profit', FLASH_TAKE_PROFIT_ORDER_TYPE],
                        ['Stop loss', FLASH_STOP_LOSS_ORDER_TYPE]
                      ] as const
                    ).map(([label, orderType]) => (
                      <ToggleButton
                        key={orderType}
                        onPress={() => events.onOrderTypeChange(orderType)}
                        pressed={state.orderType === orderType}
                        size='small'
                      >
                        <Text align='center' variant='supporting'>
                          {label}
                        </Text>
                      </ToggleButton>
                    ))}
                  </Grid>
                </Surface>
              </Group>
            ) : null}
            <Grid columns={stop ? 'two' : 'three'} gap='medium' responsive>
              {renderOrderInput({
                ariaLabel: `${name} trigger price`,
                field: 'triggerNotionalPrice',
                invalid: invalidTradeFields.triggerPrice,
                label: `${shortName} trigger`,
                placeholder: '0.00',
                required: true,
                suffix: 'USD',
                vertical: true
              })}
              {renderOrderInput({
                ariaLabel: `${name} limit price`,
                field: 'limitNotionalPrice',
                invalid: invalidTradeFields.limitPrice,
                label: stop ? 'Limit price' : `${shortName} limit`,
                placeholder: 'Market',
                suffix: 'USD',
                vertical: true
              })}
              {!stop ? (
                <Field label={takeProfit ? 'Gain' : 'Loss'} vertical>
                  <Text as='output' align='end' variant='numeric'>
                    {state.triggerDeltaLabel}
                  </Text>
                </Field>
              ) : null}
            </Grid>
            <Text variant='detail' tone='secondary'>
              {state.triggerHelp}
            </Text>
          </Stack>
        </Surface>
      )
    }

    return null
  }

  const renderTimeInForce = () => {
    return (
      <Stack gap='medium'>
        <Field label='Time in force' required>
          <Select
            label='Time in force'
            onValueChange={(value) => events.onTimeInForceChange(value as 'gtc' | 'gtt')}
            options={[
              { label: 'Good till cancelled', value: 'gtc' },
              { label: 'Good till time', value: 'gtt' }
            ]}
            value={state.timeInForce}
          />
        </Field>
        {state.timeInForce === 'gtt' ? (
          <Field invalid={invalidTradeFields.expireTime} label='Expires' required>
            <Input
              label='Order expiry'
              invalid={invalidTradeFields.expireTime}
              min={state.minimumDateTime}
              onValueChange={(value) => events.onOrderFieldChange('expireTime', value)}
              required
              type='datetime-local'
              value={state.expireTime}
            />
          </Field>
        ) : null}
      </Stack>
    )
  }

  const renderTradeAdvancedFields = () => {
    if (state.orderType === FLASH_MARKET_ORDER_TYPE) {
      return (
        <Field invalid={invalidTradeFields.slippage} label='Max slippage' suffix='%'>
          <Input
            align='end'
            appearance='plain'
            invalid={invalidTradeFields.slippage}
            label='Slippage'
            inputMode='decimal'
            onValueChange={events.onSlippageChange}
            placeholder='Automatic'
            value={state.slippage}
          />
        </Field>
      )
    }

    if (state.orderType === FLASH_TWAP_ORDER_TYPE) {
      return (
        <Stack gap='medium'>
          {renderOrderInput({
            ariaLabel: 'TWAP segments',
            field: 'twapBucketCount',
            inputMode: 'numeric',
            invalid: invalidTradeFields.twapBucketCount,
            label: 'Segments',
            placeholder: 'Automatic'
          })}
          {renderOrderInput({
            ariaLabel: 'Maximum price impact',
            field: 'maxPriceImpact',
            invalid: invalidTradeFields.maxPriceImpact,
            label: 'Max price impact',
            placeholder: 'Automatic',
            suffix: '%'
          })}
        </Stack>
      )
    }

    return renderTimeInForce()
  }

  const renderTradeAssetSelector = (asset: TradeAssetViewModel) => {
    return (
      <TokenSelector
        ariaLabel={`Select ${asset.field} asset`}
        imageCapability={capability}
        footer={
          asset.rowsHidden > 0 ? (
            <Stack>
              <Button onPress={() => events.onShowMoreAssets(asset.field)}>
                <Text align='center' variant='supporting' tone='secondary'>
                  {`Show ${Math.min(TOKEN_SELECTOR_ROWS_INCREMENT, asset.rowsHidden)} more assets`}
                </Text>
              </Button>
            </Stack>
          ) : null
        }
        items={asset.selectorItems}
        searchableItems={asset.searchableItems}
        networks={model.networks}
        networksMeta={model.networksMeta}
        onOpenChange={(open) => events.onAssetOpenChange(asset.field, open)}
        onSelect={(assetId) => events.onSelectAsset(asset.field, assetId)}
        open={asset.open}
        selectedId={asset.selectedId}
      />
    )
  }

  const renderTradeDirectionSwitch = () => {
    const nextSide = state.side === 'buy' ? 'SELL' : 'BUY'

    return (
      <IconButton
        label={`Switch to ${nextSide}`}
        appearance='subtle'
        icon='swap'
        onPress={events.onToggleSide}
        size='compact'
        title={`Switch to ${nextSide}`}
      />
    )
  }

  const renderTradeBalanceSlider = (asset: TradeAssetViewModel) => {
    return (
      <BalanceRange
        label={asset.symbol}
        balanceLabel={asset.balanceLabel}
        direction={state.side}
        onChange={(value) => events.onBalancePercentChange(asset.field, value)}
        value={asset.balancePercent}
      />
    )
  }

  const renderTradeAssetCard = (asset: TradeAssetViewModel) => {
    return (
      <Surface
        border={asset.border}
        padding='medium'
        radius='small'
        tone={asset.editable ? 'raised' : 'card'}
      >
        <Stack gap='medium'>
          <Stack align='center' direction='row' gap='small'>
            <Text variant='label' tone={asset.intentTone}>
              {asset.intent}
            </Text>
            {asset.canSwitchDirection ? renderTradeDirectionSwitch() : null}
          </Stack>
          <Stack align='center' direction='row' gap='medium' justify='between'>
            {renderTradeAssetSelector(asset)}
            <Stack grow>
              <Input
                align='end'
                appearance='amount'
                label={asset.editable ? `${asset.symbol} amount` : `Estimated ${asset.symbol} received`}
                inputMode='decimal'
                onValueChange={asset.editable ? events.onInputAmountChange : undefined}
                placeholder='0'
                readOnly={!asset.editable}
                spellCheck={false}
                value={asset.amount}
              />
            </Stack>
          </Stack>
          {asset.editable ? (
            renderTradeBalanceSlider(asset)
          ) : (
            <Stack align='center' direction='row' gap='medium' justify='end'>
              <Text variant='supporting' tone='secondary'>
                Est. received
              </Text>
              {asset.outputNotionalLabel ? (
                <Text as='strong' variant='detail'>
                  {asset.outputNotionalLabel}
                </Text>
              ) : null}
            </Stack>
          )}
        </Stack>
      </Surface>
    )
  }

  const renderTradeQuoteMeta = () => {
    const quote = model.quote
    if (!quote) return null

    return (
      <Stack gap='large'>
        <Stack align='start' direction='row' gap='large' justify='between'>
          <Stack gap='xsmall'>
            <Text variant='label' tone='secondary'>
              Est. output
            </Text>
            <Text as='small' variant='caption' tone='secondary'>
              Including estimated fees
            </Text>
          </Stack>
          <Stack align='end' gap='xsmall'>
            <Text as='strong' align='end' variant='output'>
              {quote.outputAmountLabel}
            </Text>
            <Text as='small' align='end' variant='caption' tone='secondary'>
              {quote.outputNotionalLabel}
            </Text>
          </Stack>
        </Stack>
        <Stack gap='small'>
          <Stack align='center' direction='row' gap='large' justify='between'>
            <Text variant='detail' tone='secondary'>
              Est. price impact
            </Text>
            <Text as='strong' tone={quote.estimatedImpactDanger ? 'danger' : 'primary'} variant='detail'>
              {quote.estimatedImpactLabel}
            </Text>
          </Stack>
          <Stack align='center' direction='row' gap='large' justify='between'>
            <Text variant='detail' tone='secondary'>
              Estimated fees
            </Text>
            <Text as='strong' variant='detail'>
              {quote.estimatedFeeLabel}
            </Text>
          </Stack>
          {quote.targetPriceLabel ? (
            <Stack align='center' direction='row' gap='large' justify='between'>
              <Text variant='detail' tone='secondary'>
                {quote.targetPricePairLabel}
              </Text>
              <Text as='strong' variant='detail'>
                {quote.targetPriceLabel}
              </Text>
            </Stack>
          ) : null}
        </Stack>
      </Stack>
    )
  }

  const renderTradeAdvanced = () => {
    return (
      <Disclosure
        icon='settings'
        label='Advanced'
        onToggle={events.onToggleAdvanced}
        open={state.advancedOpen}
      >
        {renderTradeAdvancedFields()}
      </Disclosure>
    )
  }

  const renderTradeFooter = () => {
    return (
      <Stack grow>
        <Button appearance='primary' disabled={!model.action.enabled} onPress={events.onReview} size='large'>
          <Text align='center' variant='action' tone='inverse'>
            {model.action.label}
          </Text>
        </Button>
      </Stack>
    )
  }

  return (
    <SidePanel
      closeLabel='Close Trade'
      footer={renderTradeFooter()}
      footerSpace='compact'
      onClose={events.onClose}
      title='Trade'
    >
      <Stack gap='large' grow>
        {renderTradeTabs()}
        {renderTradeAssetCard(state.target)}
        {renderTradeAssetCard(state.contra)}
        {renderTradeOrderFields()}
        {renderTradeAdvanced()}
        {model.quote ? (
          <Surface border='subtle' padding='medium' radius='small' tone='transparent'>
            {renderTradeQuoteMeta()}
          </Surface>
        ) : null}
        {model.validation.error ? (
          <Text align='center' variant='body' tone='danger'>
            {model.validation.error}
          </Text>
        ) : null}
        {model.progress.status ? (
          <Text align='center' variant='body' tone='secondary'>
            {model.progress.status}
          </Text>
        ) : null}
        <Spacer />
        <ProgressSteps steps={model.progress.steps} />
      </Stack>
    </SidePanel>
  )
}
