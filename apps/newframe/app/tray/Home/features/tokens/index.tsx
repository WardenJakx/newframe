import { useState } from 'react'

import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Text } from '@newframe/ui/text'

import type { Token } from '../../../../../main/store/state'
import { TrayOverlay } from '../../../../../resources/Components/TrayOverlay'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import AddToken from './AddToken'
import type { AddTokenNotifyData } from './AddToken'
import CustomTokens from './CustomTokens'

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

export default function Tokens({ initialToken }: { initialToken?: PendingCustomToken }) {
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
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
    else openOverlay({ type: 'menu' })
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
          data={current}
          onBack={back}
          onDone={done}
          onNavigate={navigate}
          onOpenNetworks={() => openOverlay({ type: 'networks' })}
        />
      ) : (
        <CustomTokens onEdit={edit} />
      )}
    </TrayOverlay>
  )
}
