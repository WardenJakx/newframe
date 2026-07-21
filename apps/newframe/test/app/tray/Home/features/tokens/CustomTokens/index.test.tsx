import { beforeEach, describe, expect, it } from 'bun:test'

import { render, screen } from '../../../../../../componentSetup'
import CustomTokens from '../../../../../../../app/tray/Home/features/tokens/CustomTokens'
import {
  applyStateMessage,
  beginStateConnection,
  resetStateMirrorForTests
} from '../../../../../../../app/state/rendererStore'
import { STATE_STREAM_SCHEMA_VERSION } from '../../../../../../../resources/state/protocol'
import { walletState } from '../../../../../state/fixtures'

const address = '0xaf88d065e77c8cc2239327c5edb3a432268e5831'

describe('CustomTokens', () => {
  beforeEach(() => {
    resetStateMirrorForTests()
    beginStateConnection('wallet-ui')
    applyStateMessage({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'custom-token-tests',
      revision: 0,
      state: walletState({
        tokens: {
          accountTokenIds: {},
          byId: {
            [`42161:${address}`]: {
              address,
              chainId: 42161,
              custom: true,
              curated: false,
              decimals: 6,
              image: {
                base64: 'aWNvbg==',
                contentHash: 'hash',
                mimeType: 'image/png'
              },
              logoURI: 'https://cdn.example/usdc.png',
              name: 'USD Coin',
              sources: ['custom'],
              symbol: 'USDC',
              updatedAt: 0
            }
          }
        }
      })
    })
  })

  it('renders custom tokens from the canonical catalog without entering an update loop', () => {
    render(<CustomTokens onEdit={() => undefined} />)

    expect(screen.getByText('USDC')).toBeTruthy()
    expect(screen.getByText('USD Coin')).toBeTruthy()
    expect(screen.getByText('Chain 42161')).toBeTruthy()
    expect(screen.getByAltText('USDC').getAttribute('src')).toBe('data:image/png;base64,aWNvbg==')
  })
})
