import { Button } from '@newframe/ui/button'
import { IconButton } from '@newframe/ui/icon-button'
import { Image } from '@newframe/ui/image'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { WalletRendererState } from '../../../../platform/state-sync/contract/projections'
import { useWalletSelector } from '../../../../platform/state-sync/renderer/useAppSelector'
import { useTokenImageHydration } from '../../../../shared/renderer/hooks/useTokenImageHydration'
import { AddressIdentity, shortAddress } from '../../../../shared/renderer/ui/AddressIdentity'
import { accountDisplayType } from '../../../../shared/renderer/ui/signerPresentation'
import { customTokens, tokenImageSource } from '../../domain'
import type { Token } from '../../domain/state/token'
import type { TokensCapability } from '../tokensCapability'

const selectCustomTokens = (state: WalletRendererState) => customTokens(state.tokens)

interface CustomTokensProps {
  capability: Pick<TokensCapability, 'hydrateTokenImage' | 'remove' | 'writeText'>
  onEdit: (token: Token) => void
  tokens: Token[]
  accountTypes: Record<string, string | undefined>
}

function CustomTokenImage({
  capability,
  token
}: {
  capability: Pick<TokensCapability, 'hydrateTokenImage'>
  token: Token
}) {
  const source = tokenImageSource(token)
  useTokenImageHydration(capability, `${token.chainId}:${token.address.toLowerCase()}`, !!source)
  return source ? <Image alt={token.symbol.toUpperCase()} size='medium' source={source} /> : null
}

function CustomTokensView({ capability, onEdit, tokens, accountTypes }: CustomTokensProps) {
  const [expandedAddress, setExpandedAddress] = useState('')
  const sortedTokens = [...tokens].sort((a, b) => a.chainId - b.chainId)

  if (!tokens.length) {
    return (
      <Text align='center' tone='disabled' variant='overline'>
        No Custom Tokens
      </Text>
    )
  }

  return (
    <Stack gap='small'>
      {sortedTokens.map((token) => {
        const expanded = expandedAddress === token.address
        return (
          <Surface key={`${token.chainId}:${token.address}`} padding='small' radius='card'>
            <Stack gap='small'>
              <Stack align='center' direction='row' gap='small'>
                <CustomTokenImage capability={capability} token={token} />
                <Stack gap='xsmall' grow>
                  <Text truncate variant='label'>
                    {token.symbol}
                  </Text>
                  <Text tone='muted' truncate variant='caption'>
                    {token.name}
                  </Text>
                </Stack>
                <Text tone='secondary' variant='microCode'>{`Chain ${token.chainId}`}</Text>
                <IconButton
                  expanded={expanded}
                  icon={expanded ? 'chevronUp' : 'chevronDown'}
                  label={`${expanded ? 'Collapse' : 'Expand'} ${token.symbol}`}
                  onPress={() => setExpandedAddress(expanded ? '' : token.address)}
                  size='small'
                />
              </Stack>
              <AddressIdentity
                address={token.address}
                accountType={accountTypes[token.address.toLowerCase()]}
                nickname={shortAddress(token.address)}
                clipboard={capability}
                showFullAddress
              />
              {expanded ? (
                <Stack direction='row' gap='small'>
                  <Button
                    appearance='control'
                    label={`Edit ${token.symbol}`}
                    onPress={() => onEdit(token)}
                    width='full'
                  >
                    <Text variant='compactAction'>Edit Token</Text>
                  </Button>
                  <Button
                    appearance='danger'
                    label={`Remove ${token.symbol}`}
                    onPress={() => {
                      setExpandedAddress('')
                      void capability.remove({
                        address: token.address,
                        chainId: token.chainId
                      })
                    }}
                    width='full'
                  >
                    <Text variant='compactAction'>Remove Token</Text>
                  </Button>
                </Stack>
              ) : null}
            </Stack>
          </Surface>
        )
      })}
    </Stack>
  )
}

export default function CustomTokens({
  capability,
  onEdit
}: {
  capability: Pick<TokensCapability, 'hydrateTokenImage' | 'remove' | 'writeText'>
  onEdit: (token: Token) => void
}) {
  const tokens = useWalletSelector(useShallow(selectCustomTokens))
  const accounts = useWalletSelector((state) => state.accounts)
  const accountTypes = useMemo(
    () =>
      Object.fromEntries(
        Object.values(accounts || {}).map((account) => [
          account.address.toLowerCase(),
          accountDisplayType(account)
        ])
      ),
    [accounts]
  )
  return (
    <CustomTokensView capability={capability} onEdit={onEdit} tokens={tokens} accountTypes={accountTypes} />
  )
}
