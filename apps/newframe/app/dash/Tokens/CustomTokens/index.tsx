import React from 'react'
import svg from '../../../../resources/svg'
import link from '../../../../resources/link'
import { cachedImageUrl } from '../../../../resources/domain/imageCache'
import type { Token } from '../../../../main/store/state'
import { useWalletSelector } from '../../../state/useAppSelector'
import type { DashRendererState } from '../../state'

const EMPTY_TOKENS: Token[] = []

const selectCustomTokens = (state: DashRendererState) => state.tokens.custom || EMPTY_TOKENS

interface CustomTokensProps {
  tokens: Token[]
}

interface CustomTokensState {
  copied?: boolean
  tokenExpanded?: number | false
}

class CustomTokensView extends React.Component<CustomTokensProps, CustomTokensState> {
  constructor(props: CustomTokensProps) {
    super(props)
    this.state = {}
  }

  override render() {
    const { tokens } = this.props

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
                        this.state.tokenExpanded === i
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
                              this.state.tokenExpanded === i
                                ? 'customTokensListItemExpand'
                                : 'customTokensListItemExpand customTokensListItemExpandActive'
                            }
                            onClick={() =>
                              this.setState({ tokenExpanded: this.state.tokenExpanded === i ? -1 : i })
                            }
                          >
                            {svg.octicon('chevron-down', { height: 16 })}
                          </div>
                        </div>
                      </div>
                      <div
                        className='customTokensListItemAddress'
                        onClick={() => {
                          void link.executeCommand({ type: 'clipboard.write', text: token.address })
                          this.setState({ copied: true })
                          setTimeout((_) => this.setState({ copied: false }), 1000)
                        }}
                      >
                        {this.state.copied ? 'Address Copied' : token.address}
                      </div>
                      <div className='customTokensListItemBottom'>
                        <div
                          className='customTokensListItemButton editButton'
                          onClick={() => {
                            void link.executeCommand({
                              type: 'dash.navigate',
                              view: 'tokens',
                              data: {
                                notify: 'addToken',
                                notifyData: {
                                  error: null,
                                  isEdit: true,
                                  address: token.address,
                                  chain: { id: token.chainId },
                                  tokenData: token
                                }
                              }
                            })
                          }}
                        >
                          {'Edit Token'}
                        </div>
                        <div
                          className='customTokensListItemButton removeButton'
                          onClick={() => {
                            this.setState({ tokenExpanded: false })
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
}

export default function CustomTokens() {
  const tokens = useWalletSelector(selectCustomTokens)

  return <CustomTokensView tokens={tokens} />
}
