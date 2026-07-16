import React, { useState } from 'react'
import svg from '../../../../../../resources/svg'
import link from '../../../../../../resources/link'
import { cachedImageUrl } from '../../../../../../resources/domain/imageCache'
import type { Token } from '../../../../../../main/store/state'
import { useWalletSelector } from '../../../../../state/useAppSelector'
import type { WalletRendererState } from '../../../../../../resources/state/projections'

const EMPTY_TOKENS: Token[] = []

const selectCustomTokens = (state: WalletRendererState) => state.tokens.custom || EMPTY_TOKENS

interface CustomTokensProps {
  onEdit: (token: Token) => void
  tokens: Token[]
}

function CustomTokensView({ onEdit, tokens }: CustomTokensProps) {
  const [copied, setCopied] = useState(false)
  const [tokenExpanded, setTokenExpanded] = useState<number | false>()

  return (
    <div className='cardShow' onMouseDown={(e) => e.stopPropagation()}>
      <div className='customTokens'>
        <div className='customTokensList'>
          {tokens.length > 0 ? (
            ([] as any[])
              .concat(tokens)
              // NOTE: preserved pre-existing behavior — comparator returns a
              // boolean rather than a number
              .sort(((a: any, b: any) => {
                return a.chainId <= b.chainId
              }) as any)
              .map((token: any, i: any) => {
                return (
                  <div
                    key={i}
                    className={
                      tokenExpanded === i
                        ? 'customTokensListItem customTokensListItemExpanded'
                        : 'customTokensListItem'
                    }
                  >
                    <div className='customTokensListItemTitle'>
                      <div className='customTokensListItemName'>
                        <img
                          src={cachedImageUrl(token.logoURI)}
                          {...({ value: token.symbol.toUpperCase() } as any)}
                          alt={token.symbol.toUpperCase()}
                        />
                        <div className='customTokensListItemText'>
                          <div className='customTokensListItemSymbol'>{token.symbol}</div>
                          <div className='customTokensListItemSub'>{token.name}</div>
                        </div>
                      </div>
                      <div className='customTokensListItemChain'>
                        <div className='customTokensListItemChainLabel'>{'Chain ID:'}</div>
                        <div>{token.chainId}</div>
                        <div
                          className={
                            tokenExpanded === i
                              ? 'customTokensListItemExpand'
                              : 'customTokensListItemExpand customTokensListItemExpandActive'
                          }
                          onClick={() => setTokenExpanded(tokenExpanded === i ? -1 : i)}
                        >
                          {svg.octicon('chevron-down', { height: 16 })}
                        </div>
                      </div>
                    </div>
                    <div
                      className='customTokensListItemAddress'
                      onClick={() => {
                        void link.executeCommand({ type: 'clipboard.write', text: token.address })
                        setCopied(true)
                        setTimeout(() => setCopied(false), 1000)
                      }}
                    >
                      {copied ? 'Address Copied' : token.address}
                    </div>
                    <div className='customTokensListItemBottom'>
                      <div className='customTokensListItemButton editButton' onClick={() => onEdit(token)}>
                        {'Edit Token'}
                      </div>
                      <div
                        className='customTokensListItemButton removeButton'
                        onClick={() => {
                          setTokenExpanded(false)
                          setTimeout(() => {
                            void link.executeCommand({
                              type: 'token.remove',
                              address: token.address,
                              chainId: token.chainId
                            })
                          }, 100)
                        }}
                      >
                        {'Remove Token'}
                      </div>
                    </div>
                  </div>
                )
              })
          ) : (
            <div className='customTokensListNoTokens'>{'No Custom Tokens'}</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CustomTokens({ onEdit }: { onEdit: (token: Token) => void }) {
  const tokens = useWalletSelector(selectCustomTokens)

  return <CustomTokensView onEdit={onEdit} tokens={tokens} />
}
