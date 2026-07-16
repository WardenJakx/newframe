import { isValidAddress } from '@ethereumjs/util'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import RingIcon from '../../../../../../resources/Components/RingIcon'
import link from '../../../../../../resources/link'
import svg from '../../../../../../resources/svg'
import { chainColorValue } from '../../../../../../resources/colors'
import { useWalletSelector } from '../../../../../state/useAppSelector'
import type { Token } from '../../../../../../main/store/state'
import type { WalletRendererState } from '../../../../../../resources/state/projections'

type TokenChain = WalletRendererState['networks']['ethereum'][number]
type TokenChainMetadata = WalletRendererState['networksMeta']['ethereum'][number]

type SelectedChain = {
  id: number
  color?: string
  name?: string
}

type TokenErrorProps = {
  text: string
  onBack(): void
  onContinue(): void
}

type EnterAddressProps = {
  chain: SelectedChain
  onNavigate(data: AddTokenNotifyData): void
}

type TokenDetailsFormProps = {
  chain: SelectedChain
  tokenData: Partial<Token> & Pick<Token, 'address'> & { totalSupply?: string }
  isEdit?: boolean
  onDone(): void
}

type AddTokenProps = {
  data?: { notifyData?: AddTokenNotifyData }
  onBack?(): void
  onDone?(): void
  onNavigate?(data: AddTokenNotifyData): void
  onOpenNetworks?(): void
}

export type AddTokenNotifyData = {
  address?: string
  chain?: SelectedChain
  error?: string | null
  tokenData?: Partial<Token> & { totalSupply?: string }
  isEdit?: boolean
}

const invalidFormatError = 'INVALID CONTRACT ADDRESS'
const unableToVerifyError = `COULD NOT FIND TOKEN WITH ADDRESS`

const TokenError = ({ text, onBack, onContinue }: TokenErrorProps) => {
  return (
    <div className='newTokenView cardShow'>
      <div className='newTokenErrorTitle'>{text}</div>

      <div className='tokenSetAddress' role='button' onClick={onBack}>
        {'BACK'}
      </div>
      {text.includes(unableToVerifyError) && (
        <div className='tokenSetAddress' role='button' onClick={onContinue}>
          {'ADD ANYWAY'}
        </div>
      )}
    </div>
  )
}

const EMPTY_CHAINS: Record<string | number, TokenChain> = {}
const EMPTY_CHAIN_METADATA: Record<string | number, TokenChainMetadata> = {}

const selectChainState = (state: WalletRendererState) => ({
  chains: state.networks.ethereum || EMPTY_CHAINS,
  chainMetadata: state.networksMeta.ethereum || EMPTY_CHAIN_METADATA
})

function SelectChain({
  onNavigate,
  onOpenNetworks
}: {
  onNavigate(data: AddTokenNotifyData): void
  onOpenNetworks(): void
}) {
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
                onClick={() =>
                  onNavigate({ chain: { id: chainId, color: primaryColor || '', name: chain.name } })
                }
              >
                <div className='originChainItemIcon'>
                  <RingIcon color={chainColorValue(primaryColor)} img={icon} small={true} />
                </div>
                {chain.name}
              </div>
            )
          })}
        </div>
      </div>
      <div className='newTokenChainSelectFooter'>
        {'Chain not listed?'}
        <div className='newTokenEnableChainLink' role='link' onClick={onOpenNetworks}>
          {'Enable it in Chains'}
        </div>
      </div>
    </div>
  )
}

const EnterAddress = ({ chain, onNavigate }: EnterAddressProps) => {
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
    onNavigate({ error, tokenData, address: contractAddress, chain })
  }

  const submit = () => {
    if (!isValidAddress(contractAddress))
      return onNavigate({
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
                  color: chainColorValue(color)
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

const TokenDetailsForm = ({ chain, tokenData, isEdit, onDone }: TokenDetailsFormProps) => {
  const [name, setName] = useState(tokenData.name || tokenDetailsDefaults.name)
  const [symbol, setSymbol] = useState(tokenData.symbol || tokenDetailsDefaults.symbol)
  const [decimals, setDecimals] = useState(tokenData.decimals || tokenDetailsDefaults.decimals)
  const [logoUri, setLogoUri] = useState(tokenData.logoURI || tokenDetailsDefaults.logoURI)

  const submitRef = useRef<HTMLDivElement>(null)

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
      decimals: Number(decimals),
      logoURI: logoUri === tokenDetailsDefaults.logoURI ? '' : logoUri
    }

    void link.executeCommand({ type: 'token.add', token }).then((result) => result.ok && onDone())
  }

  const focusSubmitButton = () => {
    if (submitRef.current) {
      submitRef.current.focus()
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement | HTMLDivElement>) => {
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
                  color: chainColorValue(color)
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

const AddToken = ({
  data,
  onBack = () => {},
  onDone = () => {},
  onNavigate = () => {},
  onOpenNetworks = () => {}
}: AddTokenProps) => {
  const { address, chain, error, tokenData, isEdit } = (data?.notifyData || {}) as AddTokenNotifyData

  if (!chain) return <SelectChain onNavigate={onNavigate} onOpenNetworks={onOpenNetworks} />
  if (!address) return <EnterAddress chain={chain} onNavigate={onNavigate} />
  if (error) {
    return <TokenError text={error} onBack={onBack} onContinue={() => onNavigate({ address, chain })} />
  }

  return (
    <TokenDetailsForm chain={chain} isEdit={isEdit} onDone={onDone} tokenData={{ ...tokenData, address }} />
  )
}

export default AddToken
