import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Image } from '@newframe/ui/image'
import { Inline } from '@newframe/ui/inline'
import { MediaIcon } from '@newframe/ui/media-icon'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { ToggleButton } from '@newframe/ui/toggle-button'

import type { FrameState } from '../frameState'
import { frameConnectionPresentation, siteConnectionPresentation } from './connectionPresentation'
import { NetworkSelector } from './NetworkSelector'
import { SettingsMessage } from './SettingsMessage'
import { SettingsPanel } from './SettingsPanel'
import { parseOrigin } from './siteOrigin'

export interface SettingsViewProps {
  tab?: { url?: string; favIconUrl?: string }
  isSupportedTab: boolean
  mmAppear: boolean
  settings: FrameState
  onSummon: () => void
  onDisconnect: () => void
  onToggleMetaMask: () => void
  onSelectChain: (chainId: string) => void
}

function DesktopConnection({ settings, onSummon }: Pick<SettingsViewProps, 'settings' | 'onSummon'>) {
  const { connectionStatus } = settings
  const presentation = frameConnectionPresentation(connectionStatus)

  return (
    <Surface border='subtle' padding='xsmall' radius='control' tone='card'>
      <Button
        appearance='ghost'
        disabled={!presentation.connected}
        label={presentation.label}
        onPress={onSummon}
        size='large'
        width='full'
      >
        <Image
          alt=''
          size='medium'
          source={presentation.connected ? 'icons/icon96good.png' : 'icons/icon96moon.png'}
        />
        <Stack gap='none' grow>
          <Text variant='label' tone={presentation.tone} truncate>
            {presentation.label}
          </Text>
          <Text variant='caption' tone='muted'>
            Desktop app
          </Text>
        </Stack>
        <Icon name='arrowRight' size='small' tone='secondary' />
      </Button>
    </Surface>
  )
}

function MetaMaskToggle({
  mmAppear,
  onToggleMetaMask
}: Pick<SettingsViewProps, 'mmAppear' | 'onToggleMetaMask'>) {
  return (
    <Surface padding='small' radius='control' tone='raised'>
      <Inline align='center' gap='small' justify='between'>
        <Stack gap='xsmall' grow>
          <Text variant='label'>Appear as MetaMask</Text>
          <Text variant='caption' tone='muted'>
            Sites currently see {mmAppear ? 'MetaMask' : 'Newframe'}
          </Text>
        </Stack>
        <ToggleButton
          appearance='switch'
          label='Appear as MetaMask'
          onPress={onToggleMetaMask}
          pressed={mmAppear}
        />
      </Inline>
    </Surface>
  )
}

function SiteConnection({
  origin,
  tab,
  settings,
  onDisconnect
}: Pick<SettingsViewProps, 'tab' | 'settings' | 'onDisconnect'> & { origin: string }) {
  const { siteConnected: connected, currentAddress: address } = settings
  const presentation = siteConnectionPresentation(connected, address)

  return (
    <Inline align='center' gap='small' grow>
      <MediaIcon source={tab?.favIconUrl} />
      <Stack gap='none' grow>
        <Text truncate variant='label'>
          {origin}
        </Text>
        <Inline align='center' gap='xsmall'>
          <Text tone={presentation.tone} variant='caption'>
            {connected ? 'Connected' : presentation.label}
          </Text>
          {connected ? (
            <Button
              appearance='ghost'
              content='icon'
              label='Disconnect this site'
              onPress={onDisconnect}
              shape='pill'
              size='compact'
            >
              <Icon name='unlink' size='small' />
            </Button>
          ) : null}
        </Inline>
      </Stack>
    </Inline>
  )
}

function ChainSelect({ settings, onSelectChain }: Pick<SettingsViewProps, 'settings' | 'onSelectChain'>) {
  const { availableChains, currentChain } = settings

  return (
    <NetworkSelector
      label='Network'
      onSelect={onSelectChain}
      options={availableChains.map((chain) => ({
        disabled: chain.connected === false,
        iconUrl: chain.icon?.[0]?.url,
        id: String(chain.chainId),
        label: chain.name || String(chain.chainId),
        selected: Number(chain.chainId) === Number.parseInt(currentChain, 16)
      }))}
    />
  )
}

function MainPanel(props: SettingsViewProps) {
  const { connectionStatus } = props.settings
  const { tab, isSupportedTab } = props
  const { protocol, origin } = parseOrigin(tab?.url)

  if (connectionStatus === 'desktop-unavailable') {
    return (
      <SettingsMessage
        action={{ href: 'https://newframe.sh', label: 'Download Newframe' }}
        detail='Open the Newframe desktop app on this machine to continue.'
        title='Newframe desktop app not found'
      />
    )
  }
  if (connectionStatus === 'extension-approval-pending') {
    return (
      <SettingsMessage
        detail='Newframe is open. Approve this extension in the desktop app.'
        title='Approve the browser extension'
      />
    )
  }

  if (!isSupportedTab) {
    return (
      <SettingsMessage
        detail={`Newframe cannot run on ${protocol + origin} pages in this browser.`}
        title='Unsupported tab'
      />
    )
  }

  return (
    <Stack gap='small'>
      <Surface border='subtle' elevation='default' padding='small' radius='card' tone='card'>
        <Inline align='start' gap='small' justify='between'>
          <SiteConnection {...props} origin={origin} />
          {tab && props.settings.availableChains.length > 0 ? <ChainSelect {...props} /> : null}
        </Inline>
      </Surface>
      <MetaMaskToggle {...props} />
    </Stack>
  )
}

export function SettingsView(props: SettingsViewProps) {
  return (
    <SettingsPanel>
      <DesktopConnection {...props} />
      <MainPanel {...props} />
    </SettingsPanel>
  )
}
