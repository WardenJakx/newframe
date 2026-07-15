import React from 'react'

import svg from '../../../../resources/svg'
import { activateOnKeyboard } from '../ui/keyboard'

export function HomeHeaderView({
  account,
  accountsOpen,
  copied,
  icon,
  menuOpen,
  name,
  onCopy,
  onOpenAccounts,
  onOpenMenu,
  onReceive
}: {
  account?: { address: string }
  accountsOpen: boolean
  copied: boolean
  icon: React.ReactNode
  menuOpen: boolean
  name: string
  onCopy: () => void
  onOpenAccounts: () => void
  onOpenMenu: () => void
  onReceive: () => void
}) {
  const address = account?.address
    ? `${account.address.substring(0, 5)}…${account.address.substring(account.address.length - 4)}`
    : ''

  return (
    <div className='t2TopBar'>
      <div className='t2AccountPill'>
        <div
          aria-expanded={accountsOpen}
          aria-haspopup='dialog'
          aria-label='Accounts'
          className='t2AccountPillIdentity'
          onClick={onOpenAccounts}
          onKeyDown={(event) => activateOnKeyboard(event, onOpenAccounts)}
          role='button'
          tabIndex={0}
        >
          <div className='t2AccountPillIcon'>{icon}</div>
          <div className='t2AccountPillText'>
            <div className='t2AccountPillName'>{name}</div>
            {address ? <div className='t2AccountPillAddress'>{address}</div> : null}
          </div>
          <div className='t2AccountPillChevron'>{svg.chevron(16)}</div>
        </div>
        {account ? (
          <div className='t2AccountPillActions'>
            <div
              aria-label='Copy account address'
              className='t2AccountPillAction'
              onClick={(event) => {
                event.stopPropagation()
                onCopy()
              }}
              onKeyDown={(event) => activateOnKeyboard(event, onCopy)}
              role='button'
              tabIndex={0}
              title='Copy address'
            >
              {copied ? svg.check(13) : svg.copy(13)}
            </div>
            <div
              aria-label='Show account QR code'
              className='t2AccountPillAction'
              onClick={(event) => {
                event.stopPropagation()
                onReceive()
              }}
              onKeyDown={(event) => activateOnKeyboard(event, onReceive)}
              role='button'
              tabIndex={0}
              title='Show QR code'
            >
              {svg.qr(13)}
            </div>
          </div>
        ) : null}
      </div>
      <div
        aria-expanded={menuOpen}
        aria-haspopup='dialog'
        aria-label='Main menu'
        className='t2MenuButton'
        onClick={onOpenMenu}
        onKeyDown={(event) => activateOnKeyboard(event, onOpenMenu)}
        role='button'
        tabIndex={0}
      >
        {svg.bars(16)}
      </div>
    </div>
  )
}
