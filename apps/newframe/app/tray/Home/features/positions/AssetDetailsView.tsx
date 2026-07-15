import React from 'react'

import svg from '../../../../../resources/svg'
import ChainTokenIcon from '../../../../../resources/Components/ChainTokenIcon'
import {
  formatUsdRate,
  isNativeCurrency,
  type DisplayedBalance
} from '../../../../../resources/domain/balance'
import { ChainIcon } from '../../components/ChainIcon'
import { activateOnKeyboard } from '../../ui/keyboard'
import { TRADE_DISABLED_CHAIN_LABEL } from './usePortfolioActions'

export function AssetDetailsView({
  asset,
  canSend,
  canTrade,
  networks,
  networksMeta,
  onBack,
  onSend,
  onTrade
}: {
  asset: DisplayedBalance
  canSend: boolean
  canTrade: boolean
  networks: Record<string | number, any>
  networksMeta: Record<string | number, any>
  onBack: () => void
  onSend: () => void
  onTrade: () => void
}) {
  const chain = networks[asset.chainId] || {}
  const price = Number(asset?.usdRate?.price || 0)
  const detailRow = (label: string, value: React.ReactNode, monospace = false) => (
    <div className='t2AssetDetailRow'>
      <div className='t2AssetDetailLabel'>{label}</div>
      <div className={monospace ? 't2AssetDetailValue t2AssetDetailValueCode' : 't2AssetDetailValue'}>
        {value}
      </div>
    </div>
  )

  return (
    <div aria-label='Asset details' className='t2Overlay t2AssetOverlay cardShow' role='dialog'>
      <div className='t2OverlayHeader'>
        <div
          aria-label='Back to positions'
          className='t2OverlayBack'
          onClick={onBack}
          onKeyDown={(event) => activateOnKeyboard(event, onBack)}
          role='button'
          tabIndex={0}
        >
          {svg.chevronLeft(13)}
        </div>
        <div className='t2OverlayTitle'>{asset.symbol}</div>
        <div className='t2OverlaySpacer' />
      </div>
      <div className='t2AssetBody'>
        <div className='t2AssetHero'>
          <div className='t2AssetHeroIcon'>
            <ChainTokenIcon
              chainId={asset.chainId}
              logoURI={asset.logoURI}
              networks={networks}
              networksMeta={networksMeta}
              size='md'
              symbol={asset.symbol}
            />
          </div>
          <div className='t2AssetHeroText'>
            <div className='t2AssetHeroName'>{asset.name || asset.symbol}</div>
            <div className='t2AssetHeroSub'>
              <span>{asset.symbol}</span>
              <span>{chain.name || `Chain ${asset.chainId}`}</span>
            </div>
          </div>
        </div>
        <div className='t2AssetDetailList'>
          {detailRow('Price', price > 0 ? `$${formatUsdRate(price, 2)}` : '$0.00')}
          {detailRow('Balance', `${asset.displayBalance} ${asset.symbol}`)}
          {detailRow(
            'Chain',
            <div className='t2AssetChainValue'>
              <div className='t2AssetChainIcon'>
                <ChainIcon
                  chainId={asset.chainId}
                  imageSize={18}
                  networks={networks}
                  networksMeta={networksMeta}
                />
              </div>
              <span>{chain.name || `Chain ${asset.chainId}`}</span>
            </div>
          )}
          {detailRow(
            'Contract Address',
            isNativeCurrency(asset.address) ? 'Native asset' : asset.address,
            !isNativeCurrency(asset.address)
          )}
        </div>
      </div>
      <div className='t2AssetFooter'>
        <div
          aria-disabled={!canSend}
          aria-label={`Send ${asset.symbol}`}
          className={canSend ? 't2AssetSendButton' : 't2AssetSendButton t2AssetSendButtonDisabled'}
          onClick={canSend ? onSend : undefined}
          role='button'
          tabIndex={canSend ? 0 : -1}
        >
          {svg.send(14)}
          <span>Send</span>
        </div>
        <div
          aria-disabled={!canTrade}
          aria-label={`Trade ${asset.symbol}`}
          className={canTrade ? 't2AssetSendButton' : 't2AssetSendButton t2AssetSendButtonDisabled'}
          onClick={canTrade ? onTrade : undefined}
          role='button'
          style={{ marginLeft: 10 }}
          tabIndex={canTrade ? 0 : -1}
          title={canTrade ? `Trade ${asset.symbol}` : TRADE_DISABLED_CHAIN_LABEL}
        >
          {svg.sync(14)}
          <span>Trade</span>
        </div>
      </div>
    </div>
  )
}
