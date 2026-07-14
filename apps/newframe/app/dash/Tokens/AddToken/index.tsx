import { isValidAddress } from '@ethereumjs/util'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import RingIcon from '../../../../resources/Components/RingIcon'
import link from '../../../../resources/link'
import svg from '../../../../resources/svg'
import { chainColorCssVariable } from '../../../../resources/style/tokens/colors'
import { useWalletSelector } from '../../../state/useAppSelector'
import type { DashChain, DashChainMetadata, DashRendererState } from '../../state'

const invalidFormatError = 'INVALID CONTRACT ADDRESS'
const unableToVerifyError = `COULD NOT FIND TOKEN WITH ADDRESS`

const navForward = (notifyData: any) =>
  link.executeCommand({
    type: 'dash.navigate',
    view: 'tokens',
    data: {
      notify: 'addToken',
      notifyData
    }
  })

const navBack = (steps = 1) => link.executeCommand({ type: 'dash.back', steps })

const TokenError = ({ text, onContinue }: any) => {
  return (
    <div className='newTokenView cardShow'>
      <div className='newTokenErrorTitle'>{text}</div>

      <div className='tokenSetAddress' role='button' onClick={() => navBack()}>
        {'BACK'}
      </div>
      {text.includes(unableToVerifyError) && (
        <div
          className='tokenSetAddress'
          role='button'
          onClick={() => {
            navBack()
            onContinue()
          }}
        >
          {'ADD ANYWAY'}
        </div>
      )}
    </div>
  )
}

const EMPTY_CHAINS: Record<string | number, DashChain> = {}
const EMPTY_CHAIN_METADATA: Record<string | number, DashChainMetadata> = {}

const selectChainState = (state: DashRendererState) => ({
  chains: state.networks.ethereum || EMPTY_CHAINS,
  chainMetadata: state.networksMeta.ethereum || EMPTY_CHAIN_METADATA
})

function SelectChain() {
  const { chains, chainMetadata } = useWalletSelector(useShallow(selectChainState))
  const activeChains = Object.values(chains).filter((chain) => chain.on)

  return (
    <div className='newTokenView cardShow'>
      <div className='newTokenChainSelectTitle'>{`Select token's chain`}</div>
      <div className='newTokenChainSelectChain'>
        <div className='originSwapChainList'>
          {activeChains.map((chain) => {
            const chainId = chain.id
            const { primaryColor, icon } = chainMetadata[chainId] || {}

            return (
              <div
                className='originChainItem'
                key={chainId}
                role='button'
                onClick={() => {
                  void link.executeCommand({
                    type: 'dash.navigate',
                    view: 'tokens',
                    data: {
                      notify: 'addToken',
                      notifyData: {
                        chain: { id: chainId, color: primaryColor || '', name: chain.name }
                      }
                    }
                  })
                }}
              >
                <div className='originChainItemIcon'>
                  <RingIcon color={chainColorCssVariable(primaryColor)} img={icon} small={true} />
                </div>
                {chain.name}
              </div>
            )
          })}
        </div>
      </div>
      <div className='newTokenChainSelectFooter'>
        {'Chain not listed?'}
        <div
          className='newTokenEnableChainLink'
          role='link'
          onClick={() => {
            void link.executeCommand({ type: 'wallet.navigate-home', view: 'networks' })
          }}
        >
          {'Enable it in Chains'}
        </div>
      </div>
    </div>
  )
}

const EnterAddress = ({ chain }: any) => {
  const [isFetching, setFetching] = useState(false)
  const [contractAddress, setAddress] = useState('')

  const { name: chainName, color } = chain

  const resolveTokenData = async () => {
    setFetching(true)

    const result = await link.executeQuery({
      type: 'token.lookup',
      address: contractAddress,
      chainId: chain.id
    })
    const tokenData = result.ok ? result.token : {}
    const error = result.ok ? null : `${unableToVerifyError} ${contractAddress}`
    return navForward({ error, tokenData, address: contractAddress, chain })
  }

  const submit = () => {
    if (!isValidAddress(contractAddress))
      return navForward({
        error: invalidFormatError,
        address: contractAddress,
        chain
      })

    resolveTokenData()
  }

  return (
    <div className='newTokenView cardShow'>
      {isFetching ? (
        <>
          <div className='signerLoading'>
            <div className='signerLoadingLoader' />
          </div>
          {'FETCHING TOKEN DATA'}
        </>
      ) : (
        <>
          <div className='newTokenChainSelectTitle'>
            <label id='newTokenAddressLabel'>{`Enter token's address`}</label>

            {chainName && (
              <div
                className='newTokenChainSelectSubtitle'
                style={{
                  color: chainColorCssVariable(color)
                }}
              >
                {`on ${chainName}`}
              </div>
            )}
          </div>

          <div className='tokenRow'>
            <div className='tokenAddress'>
              <input
                aria-labelledby='newTokenAddressLabel'
                className='tokenInput tokenInputAddress'
                value={contractAddress}
                spellCheck={false}
                autoFocus={true}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    submit()
                  }
                }}
                onChange={(e) => {
                  if (e.target.value.length > 42) {
                    e.preventDefault()
                  } else {
                    setAddress(e.target.value)
                  }
                }}
              />
            </div>
          </div>
          <div className='tokenSetAddress' role='button' onClick={submit}>
            {'Set Address'}
          </div>
        </>
      )}
    </div>
  )
}

const tokenDetailsDefaults = {
  name: 'Token Name',
  symbol: 'Symbol',
  decimals: '?',
  logoURI: 'Logo URI'
}

const TokenDetailsForm = ({ req, chain, tokenData, isEdit }: any) => {
  const [name, setName] = useState(tokenData.name || tokenDetailsDefaults.name)
  const [symbol, setSymbol] = useState(tokenData.symbol || tokenDetailsDefaults.symbol)
  const [decimals, setDecimals] = useState(tokenData.decimals || tokenDetailsDefaults.decimals)
  const [logoUri, setLogoUri] = useState(tokenData.logoURI || tokenDetailsDefaults.logoURI)

  const submitRef = useRef<any>(null)

  const { address } = tokenData
  const { name: chainName, color } = chain

  const newTokenReady =
    name &&
    name !== tokenDetailsDefaults.name &&
    symbol &&
    symbol !== tokenDetailsDefaults.symbol &&
    Number.isInteger(chain.id) &&
    Number.isInteger(decimals)

  const saveAndClose = () => {
    const token = {
      name,
      symbol,
      chainId: chain.id,
      address,
      decimals,
      logoURI: logoUri === tokenDetailsDefaults.logoURI ? '' : logoUri
    }

    void link.executeCommand({
      type: 'token.add',
      token,
      requestId: req?.handlerId,
      completion: 'return-to-tokens',
      edit: Boolean(isEdit)
    })
  }

  const focusSubmitButton = () => {
    if (submitRef.current) {
      submitRef.current.focus()
    }
  }

  const handleKeyPress = (e: any) => {
    if (e.key === 'Enter' && newTokenReady) {
      e.stopPropagation()
      saveAndClose()
    }
  }

  // handle asynchronous loading of token data
  useEffect(() => {
    const { name, symbol, decimals, logoURI } = tokenData

    setName(name || tokenDetailsDefaults.name)
    setSymbol(symbol || tokenDetailsDefaults.symbol)
    setDecimals(decimals || tokenDetailsDefaults.decimals)
    setLogoUri(logoURI || tokenDetailsDefaults.logoURI)
  }, [tokenData])

  useEffect(() => {
    focusSubmitButton()
  }, [])

  return (
    <div className='notifyBoxWrap cardShow' onMouseDown={(e) => e.stopPropagation()}>
      <div className='notifyBoxSlide'>
        <div className='addTokenTop'>
          <div className='addTokenTitle' data-testid='addTokenFormTitle'>
            {isEdit ? 'Edit Token' : 'Add New Token'}
          </div>
          <div className='newTokenChainSelectTitle'>
            <div className='newTokenChainAddress' role='heading' aria-level={2}>
              {address.substring(0, 10)}
              {svg.octicon('kebab-horizontal', { height: 14 })}
              {address.substring(address.length - 8)}
            </div>
            {chainName ? (
              <div
                className='newTokenChainSelectSubtitle'
                style={{
                  color: chainColorCssVariable(color)
                }}
              >
                {`on ${chainName}`}
              </div>
            ) : null}
          </div>
        </div>
        <div className='addToken'>
          <div className='tokenRow'>
            <div className='tokenName'>
              <label className='tokenInputLabel'>
                <input
                  className={`tokenInput ${name === tokenDetailsDefaults.name ? 'tokenInputDim' : ''}`}
                  value={name}
                  spellCheck={false}
                  onChange={(e) => {
                    setName(e.target.value)
                  }}
                  onFocus={(e) => {
                    if (e.target.value === tokenDetailsDefaults.name) setName('')
                  }}
                  onBlur={(e) => {
                    if (e.target.value === '') setName(tokenDetailsDefaults.name)
                    focusSubmitButton()
                  }}
                  onKeyDown={handleKeyPress}
                />
                Token Name
              </label>
            </div>
          </div>

          <div className='tokenRow'>
            <div className='tokenSymbol'>
              <label className='tokenInputLabel'>
                <input
                  className={`tokenInput ${symbol === tokenDetailsDefaults.symbol ? 'tokenInputDim' : ''}`}
                  value={symbol}
                  spellCheck={false}
                  onChange={(e) => {
                    if (e.target.value.length > 10) return e.preventDefault()
                    setSymbol(e.target.value)
                  }}
                  onFocus={(e) => {
                    if (e.target.value === tokenDetailsDefaults.symbol) setSymbol('')
                  }}
                  onBlur={(e) => {
                    if (e.target.value === '') setSymbol(tokenDetailsDefaults.symbol)
                    focusSubmitButton()
                  }}
                  onKeyDown={handleKeyPress}
                />
                Symbol
              </label>
            </div>

            <div className='tokenDecimals'>
              <label className='tokenInputLabel'>
                <input
                  className={`tokenInput ${
                    decimals === tokenDetailsDefaults.decimals ? 'tokenInputDim' : ''
                  }`}
                  value={decimals}
                  spellCheck={false}
                  onChange={(e) => {
                    if (!e.target.value) return setDecimals('')
                    if (e.target.value.length > 2) return e.preventDefault()

                    const decimals = parseInt(e.target.value)
                    if (!Number.isInteger(decimals)) return e.preventDefault()

                    setDecimals(decimals)
                  }}
                  onFocus={(e) => {
                    if (e.target.value === tokenDetailsDefaults.decimals) setDecimals('')
                  }}
                  onBlur={(e) => {
                    if (e.target.value === '') setDecimals(tokenDetailsDefaults.decimals)
                    focusSubmitButton()
                  }}
                  onKeyDown={handleKeyPress}
                />
                Decimals
              </label>
            </div>
          </div>

          <div className='tokenRow'>
            <div className='tokenLogoUri'>
              <label className='tokenInputLabel'>
                <input
                  className={`tokenInput ${logoUri === tokenDetailsDefaults.logoURI ? 'tokenInputDim' : ''}`}
                  value={logoUri}
                  spellCheck={false}
                  onChange={(e) => {
                    setLogoUri(e.target.value)
                  }}
                  onFocus={(e) => {
                    if (e.target.value === tokenDetailsDefaults.logoURI) setLogoUri('')
                  }}
                  onBlur={(e) => {
                    if (e.target.value === '') setLogoUri(tokenDetailsDefaults.logoURI)
                    focusSubmitButton()
                  }}
                  onKeyDown={handleKeyPress}
                />
                Logo URI
              </label>
            </div>
          </div>
          <div className='tokenRow'>
            {newTokenReady ? (
              <div
                role='button'
                tabIndex={0}
                ref={submitRef}
                className='addTokenSubmit addTokenSubmitEnabled'
                onMouseDown={(e) => {
                  if (e.button === 0) {
                    saveAndClose()
                  }
                }}
                onKeyDown={handleKeyPress}
              >
                {isEdit ? 'Save' : 'Add Token'}
              </div>
            ) : (
              <div role='button' className='addTokenSubmit'>
                Fill in Token Details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const AddToken = ({ data, req }: any) => {
  const { address, chain, error, tokenData, isEdit } = data?.notifyData || {}

  if (!chain) return <SelectChain />
  if (!address) return <EnterAddress chain={chain} />
  if (error) return <TokenError text={error} onContinue={() => navForward({ address, chain })} />

  return <TokenDetailsForm chain={chain} req={req} tokenData={{ ...tokenData, address }} isEdit={isEdit} />
}

export default AddToken
