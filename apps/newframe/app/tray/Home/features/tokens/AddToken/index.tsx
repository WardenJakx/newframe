import { isValidAddress } from '@ethereumjs/util'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@newframe/ui/button'
import { Field } from '@newframe/ui/field'
import { Input } from '@newframe/ui/input'
import { Link } from '@newframe/ui/link'
import { Text } from '@newframe/ui/text'

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
      <Text align='center' tone='danger' variant='title'>
        {text}
      </Text>

      <Button appearance='control' onPress={onBack} width='full'>
        <Text variant='action'>BACK</Text>
      </Button>
      {text.includes(unableToVerifyError) && (
        <Button appearance='primary' onPress={onContinue} width='full'>
          <Text variant='action'>ADD ANYWAY</Text>
        </Button>
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
      <Text align='center' variant='title'>{`Select token's chain`}</Text>
      <div className='newTokenChainSelectChain'>
        <div className='originSwapChainList'>
          {activeChains.map((chain) => {
            const chainId = chain.id
            const { primaryColor, icon } = chainMetadata[chainId] || {}

            return (
              <Button
                appearance='selectionOption'
                key={chainId}
                onPress={() =>
                  onNavigate({ chain: { id: chainId, color: primaryColor || '', name: chain.name } })
                }
                width='full'
              >
                <div className='originChainItemIcon'>
                  <RingIcon color={chainColorValue(primaryColor)} img={icon} small={true} />
                </div>
                <Text variant='label'>{chain.name}</Text>
              </Button>
            )
          })}
        </div>
      </div>
      <div className='newTokenChainSelectFooter'>
        <Text tone='muted' variant='supporting'>
          Chain not listed?
        </Text>
        <Link href='#networks' label='Enable it in Chains' onPress={onOpenNetworks}>
          <Text tone='accent' variant='compactAction'>
            Enable it in Chains
          </Text>
        </Link>
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
              <Input
                appearance='code'
                autoFocus
                labeledBy='newTokenAddressLabel'
                maxLength={42}
                onSubmit={submit}
                onValueChange={setAddress}
                spellCheck={false}
                value={contractAddress}
              />
            </div>
          </div>
          <Button appearance='primary' onPress={submit} width='full'>
            <Text variant='action'>Set Address</Text>
          </Button>
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

  const submitRef = useRef<HTMLButtonElement>(null)

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
              <Field label='Token Name'>
                <Input
                  appearance='plain'
                  onBlur={(value) => {
                    if (value === '') setName(tokenDetailsDefaults.name)
                    focusSubmitButton()
                  }}
                  onFocus={(value) => {
                    if (value === tokenDetailsDefaults.name) setName('')
                  }}
                  onSubmit={newTokenReady ? saveAndClose : undefined}
                  onValueChange={setName}
                  placeholder={tokenDetailsDefaults.name}
                  spellCheck={false}
                  value={name}
                />
              </Field>
            </div>
          </div>

          <div className='tokenRow'>
            <div className='tokenSymbol'>
              <Field label='Symbol'>
                <Input
                  appearance='plain'
                  maxLength={10}
                  onBlur={(value) => {
                    if (value === '') setSymbol(tokenDetailsDefaults.symbol)
                    focusSubmitButton()
                  }}
                  onFocus={(value) => {
                    if (value === tokenDetailsDefaults.symbol) setSymbol('')
                  }}
                  onSubmit={newTokenReady ? saveAndClose : undefined}
                  onValueChange={setSymbol}
                  placeholder={tokenDetailsDefaults.symbol}
                  spellCheck={false}
                  value={symbol}
                />
              </Field>
            </div>

            <div className='tokenDecimals'>
              <Field label='Decimals'>
                <Input
                  appearance='plain'
                  inputMode='numeric'
                  maxLength={2}
                  onBlur={(value) => {
                    if (value === '') setDecimals(tokenDetailsDefaults.decimals)
                    focusSubmitButton()
                  }}
                  onFocus={(value) => {
                    if (value === tokenDetailsDefaults.decimals) setDecimals('')
                  }}
                  onSubmit={newTokenReady ? saveAndClose : undefined}
                  onValueChange={(value) => {
                    if (!value) return setDecimals('')
                    const parsed = Number.parseInt(value)
                    if (Number.isInteger(parsed)) setDecimals(parsed)
                  }}
                  placeholder={tokenDetailsDefaults.decimals}
                  spellCheck={false}
                  value={decimals}
                />
              </Field>
            </div>
          </div>

          <div className='tokenRow'>
            <div className='tokenLogoUri'>
              <Field label='Logo URI'>
                <Input
                  appearance='plain'
                  onBlur={(value) => {
                    if (value === '') setLogoUri(tokenDetailsDefaults.logoURI)
                    focusSubmitButton()
                  }}
                  onFocus={(value) => {
                    if (value === tokenDetailsDefaults.logoURI) setLogoUri('')
                  }}
                  onSubmit={newTokenReady ? saveAndClose : undefined}
                  onValueChange={setLogoUri}
                  placeholder={tokenDetailsDefaults.logoURI}
                  spellCheck={false}
                  value={logoUri}
                />
              </Field>
            </div>
          </div>
          <div className='tokenRow'>
            {newTokenReady ? (
              <Button appearance='primary' ref={submitRef} onPress={saveAndClose} width='full'>
                <Text variant='action'>{isEdit ? 'Save' : 'Add Token'}</Text>
              </Button>
            ) : (
              <Button disabled appearance='primary' width='full'>
                <Text variant='action'>Fill in Token Details</Text>
              </Button>
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
