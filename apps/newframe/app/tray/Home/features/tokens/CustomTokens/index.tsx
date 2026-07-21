import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@newframe/ui/button'
import { IconButton } from '@newframe/ui/icon-button'
import { Image } from '@newframe/ui/image'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import type { Token } from '../../../../../../main/store/state'
import link from '../../../../../../resources/link'
import { customTokens, tokenImageSource } from '../../../../../../resources/domain/token'
import type { WalletRendererState } from '../../../../../../resources/state/projections'
import { useWalletSelector } from '../../../../../state/useAppSelector'

const selectCustomTokens = (state: WalletRendererState) => customTokens(state.tokens)

interface CustomTokensProps {
  onEdit: (token: Token) => void
  tokens: Token[]
}

function CustomTokensView({ onEdit, tokens }: CustomTokensProps) {
  const [copiedAddress, setCopiedAddress] = useState('')
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
                {tokenImageSource(token) ? (
                  <Image alt={token.symbol.toUpperCase()} size='medium' source={tokenImageSource(token)} />
                ) : null}
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
              <Button
                appearance='ghost'
                label={`Copy ${token.symbol} address`}
                onPress={() => {
                  void link.executeCommand({ type: 'clipboard.write', text: token.address })
                  setCopiedAddress(token.address)
                  setTimeout(() => setCopiedAddress(''), 1000)
                }}
                width='full'
              >
                <Text tone={copiedAddress === token.address ? 'accent' : 'secondary'} truncate variant='code'>
                  {copiedAddress === token.address ? 'Address Copied' : token.address}
                </Text>
              </Button>
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
                      void link.executeCommand({
                        type: 'token.remove',
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

export default function CustomTokens({ onEdit }: { onEdit: (token: Token) => void }) {
  const tokens = useWalletSelector(useShallow(selectCustomTokens))
  return <CustomTokensView onEdit={onEdit} tokens={tokens} />
}
