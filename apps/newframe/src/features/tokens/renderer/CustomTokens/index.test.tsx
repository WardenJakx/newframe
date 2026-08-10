import { beforeEach, describe, expect, it } from 'bun:test'

import { render, screen } from '../../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../../test/support/rendererClient'
import CustomTokensController from './index'
import { createTokensCapability } from '../tokensCapability'
import type { ComponentProps } from 'react'
import { walletState } from '../../../../platform/state-sync/renderer/fixtures.test-support.ts'

const fixture = registerTestRuntimeFixture()
const capability = createTokensCapability({
  executeCommand: (command) => fixture.client.executeCommand(command),
  executeQuery: (query) => fixture.client.executeQuery(query)
})
const CustomTokens = (props: Omit<ComponentProps<typeof CustomTokensController>, 'capability'>) => (
  <CustomTokensController {...props} capability={capability} />
)

const address = '0xaf88d065e77c8cc2239327c5edb3a432268e5831'

describe('CustomTokens', () => {
  beforeEach(() => {
    fixture.state.reset(
      walletState({
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
    )
  })

  it('renders custom tokens from the canonical catalog without entering an update loop', () => {
    render(<CustomTokens onEdit={() => undefined} />)

    expect(screen.getByText('USDC')).toBeTruthy()
    expect(screen.getByText('USD Coin')).toBeTruthy()
    expect(screen.getByText('Chain 42161')).toBeTruthy()
    expect(screen.getByAltText('USDC').getAttribute('src')).toBe('data:image/png;base64,aWNvbg==')
  })
})
