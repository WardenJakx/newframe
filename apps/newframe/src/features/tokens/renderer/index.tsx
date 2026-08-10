import { useState } from 'react'

import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Text } from '@newframe/ui/text'

import type { Token } from '../domain/state/token'
import { TrayOverlay } from '../../../shared/renderer/ui/TrayOverlay'
import AddToken from './AddToken'
import type { AddTokenNotifyData } from './AddToken'
import CustomTokens from './CustomTokens'
import type { TokensCapability } from './tokensCapability'

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

export default function Tokens({
  capability,
  initialToken,
  onBack,
  onOpenNetworks
}: {
  capability: TokensCapability
  initialToken?: PendingCustomToken
  onBack: () => void
  onOpenNetworks: () => void
}) {
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
    else onBack()
  }
  const done = () => setPages([listPage])
  const edit = (token: Token) =>
    navigate({
      address: token.address,
      chain: { id: token.chainId },
      isEdit: true,
      tokenData: token
    })

  const footer =
    current.notify !== 'addToken' ? (
      <Button
        appearance='raised'
        label='Add New Token'
        onPress={() => navigate({})}
        shape='pill'
        size='large'
        width='full'
      >
        <Icon name='plus' size='medium' />
        <Text variant='action'>Add New Token</Text>
      </Button>
    ) : undefined

  return (
    <TrayOverlay
      closeLabel='Back'
      footer={footer}
      label='Custom Tokens'
      onClose={back}
      padding='none'
      title='Custom Tokens'
    >
      {current.notify === 'addToken' ? (
        <AddToken
          capability={capability}
          data={current}
          onBack={back}
          onDone={done}
          onNavigate={navigate}
          onOpenNetworks={onOpenNetworks}
        />
      ) : (
        <CustomTokens capability={capability} onEdit={edit} />
      )}
    </TrayOverlay>
  )
}
