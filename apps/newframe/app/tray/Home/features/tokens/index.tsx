import { useState } from 'react'

import type { Token } from '../../../../../main/store/state'
import svg from '../../../../../resources/svg'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { activateOnKeyboard } from '../../ui/keyboard'
import AddToken from './AddToken'
import type { AddTokenNotifyData } from './AddToken'
import CustomTokens from './CustomTokens'

interface PendingCustomToken {
  address: string
  chainId: number
  decimals?: number
  logoURI?: string
  name?: string
  symbol?: string
}

interface TokenPage {
  notify?: 'addToken'
  notifyData?: AddTokenNotifyData
}

const listPage: TokenPage = {}

const addPage = (notifyData: AddTokenNotifyData = {}): TokenPage => ({
  notify: 'addToken',
  notifyData
})

export default function Tokens({ initialToken }: { initialToken?: PendingCustomToken }) {
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
  const [pages, setPages] = useState<TokenPage[]>(() =>
    initialToken
      ? [
          addPage({
            address: initialToken.address,
            chain: { id: initialToken.chainId },
            tokenData: initialToken
          }),
          listPage
        ]
      : [listPage]
  )
  const current = pages[0]
  const navigate = (notifyData: AddTokenNotifyData) =>
    setPages((existing) => [addPage(notifyData), ...existing])
  const back = () => {
    if (pages.length > 1) setPages((existing) => existing.slice(1))
    else openOverlay({ type: 'menu' })
  }
  const done = () => setPages([listPage])
  const edit = (token: Token) =>
    navigate({
      address: token.address,
      chain: { id: token.chainId },
      isEdit: true,
      tokenData: token
    })

  return (
    <div aria-label='Custom Tokens' className='t2Overlay cardShow' role='dialog'>
      <div className='t2OverlayHeader'>
        <div
          aria-label='Back'
          className='t2OverlayBack'
          onClick={back}
          onKeyDown={(event) => activateOnKeyboard(event, back)}
          role='button'
          tabIndex={0}
        >
          {svg.chevronLeft(16)}
        </div>
        <div className='t2OverlayTitle'>Custom Tokens</div>
        <div className='t2OverlaySpacer' />
      </div>
      <div className='t2OverlayScroll t2LegacyTokens'>
        {current.notify === 'addToken' ? (
          <AddToken
            data={current}
            onBack={back}
            onDone={done}
            onNavigate={navigate}
            onOpenNetworks={() => openOverlay({ type: 'networks' })}
          />
        ) : (
          <CustomTokens onEdit={edit} />
        )}
      </div>
      {current.notify !== 'addToken' ? (
        <div className='t2LegacyTokenFooter'>
          <div
            aria-label='Add New Token'
            className='t2LegacyTokenFooterButton'
            onClick={() => navigate({})}
            onKeyDown={(event) => activateOnKeyboard(event, () => navigate({}))}
            role='button'
            tabIndex={0}
          >
            <div className='newAccountIcon'>{svg.plus(16)}</div>
            Add New Token
          </div>
        </div>
      ) : null}
    </div>
  )
}
