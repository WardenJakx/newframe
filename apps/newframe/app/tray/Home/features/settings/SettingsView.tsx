import { useState } from 'react'

import { Button } from '@newframe/ui/button'
import { Input } from '@newframe/ui/input'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'
import { ToggleButton } from '@newframe/ui/toggle-button'

import { SidePanelHeader } from '../../../../../resources/Components/SidePanel/SidePanelHeader'
import KeyboardShortcutConfigurator from '../../../../../resources/Components/KeyboardShortcutConfigurator'
import { SettingsActionRow, SettingsSelectRow, SettingsToggleRow } from '../../ui/SettingsRow'

const shortcutKeyDisplay: Record<string, string> = {
  Slash: '/',
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Backquote: '`',
  Minus: '-',
  Equal: '='
}

export interface SettingsViewProps {
  drafts: {
    changeLatticeEndpoint: (value: string) => void
    changeLatticeEndpointMode: (value: string) => void
    changePortfolioApiKey: (value: string) => void
    latticeEndpoint: string
    latticeEndpointMode: string
    portfolioApiKey: string
    portfolioApiKeyRequired: boolean
    toggleAutoDiscoverTokens: (enabled: boolean) => void
  }
  onBack: () => void
  onBiometricUnlockChange: (enabled: boolean) => void
  onLock: () => void
  onReset: (scope: 'saved-data' | 'all-settings-data') => void
  onShowTestnetsChange: (enabled: boolean) => void
  onUpdate: (setting: string, value: any) => void
  settings: Record<string, any>
}

function shortcutLabel(platform: string, shortcut: any) {
  const modifiers = (shortcut.modifierKeys || []).map((key: string) => {
    if (key === 'Alt') return platform === 'darwin' ? 'Option' : 'Alt'
    if (key === 'Meta' || key === 'Super') return platform === 'darwin' ? 'Cmd' : 'Win'
    if (key === 'Control' || key === 'CommandOrControl') return 'Ctrl'
    return key
  })
  const key = shortcutKeyDisplay[shortcut.shortcutKey] || shortcut.shortcutKey
  return [...modifiers, key].join(' + ')
}

export function SettingsView({
  drafts,
  onBack,
  onBiometricUnlockChange,
  onLock,
  onReset,
  onShowTestnetsChange,
  onUpdate,
  settings
}: SettingsViewProps) {
  const [resetConfirm, setResetConfirm] = useState(false)
  const portfolioApiKeyDetail = drafts.portfolioApiKeyRequired
    ? 'Enter a Zerion API key before enabling'
    : drafts.portfolioApiKey.trim()
      ? 'Fetch portfolio tokens and balances from Zerion'
      : 'Add a Zerion API key to enable'
  const trezorOptions = [
    { text: 'Standard', value: 'standard' },
    { text: 'Legacy', value: 'legacy' },
    { text: 'Testnet', value: 'testnet' }
  ]
  const ledgerOptions = [
    { text: 'Live', value: 'live' },
    { text: 'Legacy', value: 'legacy' },
    { text: 'Standard', value: 'standard' },
    { text: 'Testnet', value: 'testnet' }
  ]
  const latticeOptions = [
    { text: 'Standard', value: 'standard' },
    { text: 'Legacy', value: 'legacy' },
    { text: 'Live', value: 'live' }
  ]
  const accountLimitOptions = [5, 10, 20, 40].map((value) => ({ text: String(value), value }))
  const toggleRows = [
    ['Auto-hide', settings.autohide, 'Hide Newframe on loss of focus', 'autohide'],
    ['Run on Startup', settings.launch, 'Run Newframe when your computer starts', 'launch'],
    ['Glide', settings.reveal, "Mouse to display's right edge to summon Newframe", 'reveal'],
    ...(settings.platform === 'darwin'
      ? [
          [
            'Display Gas in Menubar',
            settings.menubarGasPrice,
            'Show mainnet gas price in the menu bar',
            'menubar-gas-price'
          ]
        ]
      : []),
    [
      'Show Account Name with ENS',
      settings.showLocalNameWithENS,
      'Show local account name when ENS is resolved',
      'show-local-name-with-ens'
    ]
  ] as Array<[string, boolean, string, string]>

  return (
    <div aria-label='Settings' className='t2Overlay cardShow' role='dialog'>
      <SidePanelHeader closeLabel='Back' onClose={onBack} title='Settings' />
      <div className='t2OverlayScroll t2SettingsScroll'>
        <div className='t2SettingsSection'>
          <Text tone='muted' variant='overline'>
            Shortcut
          </Text>
          <div className='t2SettingsRow t2SettingsShortcutRow'>
            <div className='t2SettingsShortcutTop'>
              <Stack gap='xsmall' grow>
                <Text truncate variant='label'>
                  Summon Shortcut
                </Text>
                <Text tone='muted' variant='caption'>
                  {shortcutLabel(settings.platform, settings.summonShortcut)}
                </Text>
              </Stack>
              <div className='t2SettingsShortcutControls'>
                <Button
                  appearance='control'
                  label={settings.summonShortcut.configuring ? 'Cancel shortcut edit' : 'Edit shortcut'}
                  onPress={() => onUpdate('shortcut-configuring', !settings.summonShortcut.configuring)}
                  shape='pill'
                  size='small'
                >
                  <Text variant='compactAction'>
                    {settings.summonShortcut.configuring ? 'Cancel' : 'Edit'}
                  </Text>
                </Button>
                <ToggleButton
                  appearance='switch'
                  label='Summon Shortcut'
                  onPress={() => onUpdate('shortcut-enabled', !settings.summonShortcut.enabled)}
                  pressed={settings.summonShortcut.enabled}
                />
              </div>
            </div>
            <div className='t2SettingsShortcutDetails'>
              <KeyboardShortcutConfigurator
                actionText='summon Newframe'
                onChange={(value) => onUpdate('summon-shortcut', value)}
                platform={settings.platform}
                shortcut={settings.summonShortcut}
                shortcutName='summon'
              />
            </div>
          </div>
        </div>

        <div aria-label='App' className='t2SettingsSection' role='group'>
          <Text tone='muted' variant='overline'>
            App
          </Text>
          {toggleRows.map(([label, on, detail, setting]) => (
            <SettingsToggleRow
              key={setting}
              detail={detail}
              label={label}
              on={on}
              onToggle={() => onUpdate(setting, !on)}
            />
          ))}
          <SettingsToggleRow
            detail='Show testnet chains in Networks'
            label='Show Testnets'
            on={settings.showTestnets}
            onToggle={() => onShowTestnetsChange(!settings.showTestnets)}
          />
          <SettingsToggleRow
            detail={
              settings.biometricsBusy
                ? 'Waiting for authentication'
                : settings.biometricsError || 'Unlock Newframe with Touch ID or a platform passkey'
            }
            label='Biometric Login'
            on={settings.biometricUnlock}
            onToggle={() => onBiometricUnlockChange(!settings.biometricUnlock)}
          />
          <SettingsActionRow action='Lock' label='Lock Newframe' onAction={onLock} />
          <SettingsActionRow action='Reset' label='Reset Saved Data' onAction={() => onReset('saved-data')} />
          {resetConfirm ? (
            <div className='t2SettingsRow t2SettingsResetConfirm'>
              <Text truncate variant='label'>
                Reset All Settings & Data?
              </Text>
              <Stack direction='row' gap='xsmall'>
                <Button
                  appearance='danger'
                  onPress={() => onReset('all-settings-data')}
                  shape='pill'
                  size='small'
                >
                  <Text variant='compactAction'>Yes</Text>
                </Button>
                <Button appearance='control' onPress={() => setResetConfirm(false)} shape='pill' size='small'>
                  <Text variant='compactAction'>No</Text>
                </Button>
              </Stack>
            </div>
          ) : (
            <SettingsActionRow
              action='Reset'
              danger
              label='Reset All Settings & Data'
              onAction={() => setResetConfirm(true)}
            />
          )}
        </div>

        <div className='t2SettingsSection'>
          <Text tone='muted' variant='overline'>
            Signer Defaults
          </Text>
          <SettingsSelectRow
            currentValue={settings.trezorDerivation}
            label='Trezor Derivation'
            onChange={(value) => onUpdate('trezor-derivation', value)}
            options={trezorOptions}
          />
          <SettingsSelectRow
            currentValue={settings.ledgerDerivation}
            label='Ledger Derivation'
            onChange={(value) => onUpdate('ledger-derivation', value)}
            options={ledgerOptions}
          />
          {settings.ledgerDerivation === 'live' ? (
            <SettingsSelectRow
              currentValue={settings.liveAccountLimit}
              label='Ledger Live Accounts'
              onChange={(value) => onUpdate('ledger-live-account-limit', value)}
              options={accountLimitOptions}
            />
          ) : null}
          <SettingsSelectRow
            currentValue={settings.latticeDerivation}
            label='Lattice Derivation'
            onChange={(value) => onUpdate('lattice-derivation', value)}
            options={latticeOptions}
          />
          <SettingsSelectRow
            currentValue={settings.latticeAccountLimit}
            label='Lattice Accounts'
            onChange={(value) => onUpdate('lattice-account-limit', value)}
            options={accountLimitOptions}
          />
          <SettingsSelectRow
            currentValue={drafts.latticeEndpointMode}
            label='Lattice Relay'
            onChange={drafts.changeLatticeEndpointMode}
            options={[
              { text: 'Default', value: 'default' },
              { text: 'Custom', value: 'custom' }
            ]}
          />
          {drafts.latticeEndpointMode === 'custom' ? (
            <Input
              appearance='code'
              label='Custom Lattice Relay'
              onValueChange={drafts.changeLatticeEndpoint}
              placeholder='Custom Relay'
              spellCheck={false}
              value={drafts.latticeEndpoint}
            />
          ) : null}
        </div>

        <div className='t2SettingsSection'>
          <Text tone='muted' variant='overline'>
            Tokens
          </Text>
          <SettingsToggleRow
            detail={portfolioApiKeyDetail}
            label='Auto-Discover Tokens'
            on={settings.autoDiscoverTokens}
            onToggle={() => drafts.toggleAutoDiscoverTokens(settings.autoDiscoverTokens)}
          />
          <Input
            appearance='code'
            autoComplete='off'
            label='Zerion API Key'
            onValueChange={drafts.changePortfolioApiKey}
            placeholder='Zerion API Key'
            spellCheck={false}
            type='password'
            value={drafts.portfolioApiKey}
          />
        </div>
      </div>
    </div>
  )
}
