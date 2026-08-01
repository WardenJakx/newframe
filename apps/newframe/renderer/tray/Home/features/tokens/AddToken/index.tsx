import { isValidAddress } from '@ethereumjs/util'
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@newframe/ui/button'
import { Field } from '@newframe/ui/field'
import { Input } from '@newframe/ui/input'
import { Link } from '@newframe/ui/link'
import { ScrollArea } from '@newframe/ui/scroll-area'
import { Spinner } from '@newframe/ui/spinner'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import RingIcon from '../../../../../shared/ui/RingIcon'
import link from '../../../../../shared/link'
import { chainColorValue } from '../../../../../../domain/chain/colors'
import { persistedImageSource } from '../../../../../../domain/image'
import { toTokenId } from '../../../../../../domain/token'
import { useWalletSelector } from '../../../../../state/useAppSelector'
import { selectOperationById } from '../../../../../state/selectors/operation'
import type { Token } from '../../../../../../domain/state/token'
import type { WalletRendererState } from '../../../../../../contracts/state/projections'

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

type TokenSubmission = {
  operationId: string
  token: Token
}

type TokenBoundaryFailure = {
  operationId: string
  message: string
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
    <Stack gap='medium'>
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
    </Stack>
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
    <Stack gap='medium' grow>
      <Text align='center' variant='title'>{`Select token's chain`}</Text>
      <ScrollArea height='fill'>
        <Stack gap='xsmall'>
          {activeChains.map((chain) => {
            const chainId = chain.id
            const { primaryColor, image } = chainMetadata[chainId] || {}

            return (
              <Button
                appearance='selectionOption'
                key={chainId}
                onPress={() =>
                  onNavigate({ chain: { id: chainId, color: primaryColor || '', name: chain.name } })
                }
                width='full'
              >
                <RingIcon color={chainColorValue(primaryColor)} img={persistedImageSource(image)} small />
                <Text variant='label'>{chain.name}</Text>
              </Button>
            )
          })}
        </Stack>
      </ScrollArea>
      <Stack align='center' gap='xsmall'>
        <Text tone='muted' variant='supporting'>
          Chain not listed?
        </Text>
        <Link href='#networks' label='Enable it in Chains' onPress={onOpenNetworks}>
          <Text tone='accent' variant='compactAction'>
            Enable it in Chains
          </Text>
        </Link>
      </Stack>
    </Stack>
  )
}

const EnterAddress = ({ chain, onNavigate }: EnterAddressProps) => {
  const [isFetching, setFetching] = useState(false)
  const [contractAddress, setAddress] = useState('')

  const { name: chainName } = chain

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
    <Stack gap='medium'>
      {isFetching ? (
        <Stack align='center' gap='small'>
          <Spinner label='Fetching token data' />
          <Text tone='secondary' variant='overline'>
            Fetching Token Data
          </Text>
        </Stack>
      ) : (
        <>
          <Stack align='center' gap='xsmall'>
            <Text variant='sectionTitle'>{`Enter token's address`}</Text>
            {chainName && <Text tone='accent' variant='overline'>{`on ${chainName}`}</Text>}
          </Stack>

          <Field label={`Enter token's address`}>
            <Input
              appearance='code'
              autoFocus
              label={`Enter token's address`}
              maxLength={42}
              onSubmit={submit}
              onValueChange={setAddress}
              spellCheck={false}
              value={contractAddress}
            />
          </Field>
          <Button appearance='primary' onPress={submit} width='full'>
            <Text variant='action'>Set Address</Text>
          </Button>
        </>
      )}
    </Stack>
  )
}

const tokenDetailsDefaults = {
  name: 'Token Name',
  symbol: 'Symbol',
  decimals: '?',
  logoURI: 'Logo URI'
}

const TokenDetailsForm = ({ chain, tokenData, isEdit, onDone }: TokenDetailsFormProps) => {
  const tokenName = tokenData.name
  const tokenSymbol = tokenData.symbol
  const tokenDecimals = tokenData.decimals
  const tokenLogoUri = tokenData.logoURI
  const [name, setName] = useState(tokenName || tokenDetailsDefaults.name)
  const [symbol, setSymbol] = useState(tokenSymbol || tokenDetailsDefaults.symbol)
  const [decimals, setDecimals] = useState(tokenDecimals || tokenDetailsDefaults.decimals)
  const [logoUri, setLogoUri] = useState(tokenLogoUri || tokenDetailsDefaults.logoURI)
  const [submission, setSubmission] = useState<TokenSubmission | null>(null)
  const [boundaryFailure, setBoundaryFailure] = useState<TokenBoundaryFailure | null>(null)

  const submitRef = useRef<HTMLButtonElement>(null)
  const completionNotifiedRef = useRef('')

  const { address } = tokenData
  const { name: chainName } = chain
  const submittedToken = submission?.token
  const projectedToken = useWalletSelector((state) =>
    submittedToken ? state.tokens?.byId?.[toTokenId(submittedToken)] : undefined
  )
  const operation = useWalletSelector((state) =>
    submission ? selectOperationById(state, submission.operationId) : undefined
  )
  const tokenReflected = Boolean(
    submittedToken &&
    projectedToken &&
    projectedToken.name === submittedToken.name &&
    projectedToken.symbol === submittedToken.symbol &&
    projectedToken.decimals === submittedToken.decimals &&
    (projectedToken.logoURI || '') === (submittedToken.logoURI || '')
  )

  const newTokenReady =
    name &&
    name !== tokenDetailsDefaults.name &&
    symbol &&
    symbol !== tokenDetailsDefaults.symbol &&
    Number.isInteger(chain.id) &&
    Number.isInteger(decimals)
  const activeBoundaryFailure =
    submission && boundaryFailure?.operationId === submission.operationId ? boundaryFailure : null
  const savingToken = Boolean(submission && operation?.status !== 'failed' && !activeBoundaryFailure)

  const saveAndClose = () => {
    const token = {
      name,
      symbol,
      chainId: chain.id,
      address,
      decimals: Number(decimals),
      logoURI: logoUri === tokenDetailsDefaults.logoURI ? '' : logoUri
    }

    const operationId = crypto.randomUUID()
    setBoundaryFailure(null)
    setSubmission({ operationId, token })
    void link
      .executeCommand({ type: 'token.add', operationId, token })
      .then((result) => {
        if (!result.ok) {
          setBoundaryFailure({
            operationId,
            message: result.message || 'Could not submit the token update.'
          })
        }
      })
      .catch(() => {
        setBoundaryFailure({ operationId, message: 'Could not submit the token update.' })
      })
  }

  const focusSubmitButton = () => {
    if (submitRef.current) {
      submitRef.current.focus()
    }
  }

  useEffect(() => {
    focusSubmitButton()
  }, [])

  useEffect(() => {
    if (!submission || completionNotifiedRef.current === submission.operationId || !tokenReflected) {
      return
    }
    completionNotifiedRef.current = submission.operationId
    onDone()
  }, [onDone, submission, tokenReflected])

  return (
    <ScrollArea height='fill'>
      <Stack gap='medium'>
        <Stack align='center' gap='xsmall'>
          <Text align='center' variant='heading'>
            <span data-testid='addTokenFormTitle'>{isEdit ? 'Edit Token' : 'Add New Token'}</span>
          </Text>
          <Text align='center' as='h2' variant='code'>
            {`${address.substring(0, 10)}${address.substring(address.length - 8)}`}
          </Text>
          {chainName ? <Text tone='accent' variant='overline'>{`on ${chainName}`}</Text> : null}
        </Stack>
        <Surface padding='small' radius='card'>
          <Stack gap='small'>
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
                onSubmit={newTokenReady && !savingToken ? saveAndClose : undefined}
                onValueChange={setName}
                placeholder={tokenDetailsDefaults.name}
                spellCheck={false}
                value={name}
              />
            </Field>

            <Stack direction='row' gap='small'>
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
                  onSubmit={newTokenReady && !savingToken ? saveAndClose : undefined}
                  onValueChange={setSymbol}
                  placeholder={tokenDetailsDefaults.symbol}
                  spellCheck={false}
                  value={symbol}
                />
              </Field>

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
                  onSubmit={newTokenReady && !savingToken ? saveAndClose : undefined}
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
            </Stack>

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
                onSubmit={newTokenReady && !savingToken ? saveAndClose : undefined}
                onValueChange={setLogoUri}
                placeholder={tokenDetailsDefaults.logoURI}
                spellCheck={false}
                value={logoUri}
              />
            </Field>
            {newTokenReady ? (
              <Button
                appearance='primary'
                disabled={savingToken}
                ref={submitRef}
                onPress={saveAndClose}
                width='full'
              >
                <Text variant='action'>{savingToken ? 'Saving Token' : isEdit ? 'Save' : 'Add Token'}</Text>
              </Button>
            ) : (
              <Button disabled appearance='primary' width='full'>
                <Text variant='action'>Fill in Token Details</Text>
              </Button>
            )}
            {operation?.status === 'failed' ? (
              <Text tone='danger' variant='caption'>
                {operation.error?.message || 'Could not update the custom token.'}
              </Text>
            ) : activeBoundaryFailure ? (
              <Text tone='danger' variant='caption'>
                {activeBoundaryFailure.message}
              </Text>
            ) : null}
          </Stack>
        </Surface>
      </Stack>
    </ScrollArea>
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

  const tokenDetailsKey = [
    chain.id,
    address,
    tokenData?.name || '',
    tokenData?.symbol || '',
    tokenData?.decimals ?? '',
    tokenData?.logoURI || ''
  ].join(':')

  return (
    <TokenDetailsForm
      key={tokenDetailsKey}
      chain={chain}
      isEdit={isEdit}
      onDone={onDone}
      tokenData={{ ...tokenData, address }}
    />
  )
}

export default AddToken
