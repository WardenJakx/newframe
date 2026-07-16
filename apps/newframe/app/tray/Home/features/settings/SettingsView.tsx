import { useState } from 'react'

import svg from '../../../../../resources/svg'
import KeyboardShortcutConfigurator from '../../../../../resources/Components/KeyboardShortcutConfigurator'
import { SettingsActionRow, SettingsSelectRow, SettingsToggleRow } from '../../ui/SettingsRow'
import { Toggle } from '../../ui/Toggle'
import { activateOnKeyboard } from '../../ui/keyboard'

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
      <div className='t2OverlayHeader'>
        <div
          aria-label='Back'
          className='t2OverlayBack'
          onClick={onBack}
          onKeyDown={(event) => activateOnKeyboard(event, onBack)}
          role='button'
          tabIndex={0}
        >
          {svg.chevronLeft(16)}
        </div>
        <div className='t2OverlayTitle'>Settings</div>
        <div className='t2OverlaySpacer' />
      </div>
      <div className='t2OverlayScroll t2SettingsScroll'>
        <div className='t2SettingsSection'>
          <div className='t2SettingsSectionTitle'>Shortcut</div>
          <div className='t2SettingsRow t2SettingsShortcutRow'>
            <div className='t2SettingsShortcutTop'>
              <div className='t2SettingsRowText'>
                <div className='t2SettingsRowTitle'>Summon Shortcut</div>
                <div className='t2SettingsRowDetail'>
                  {shortcutLabel(settings.platform, settings.summonShortcut)}
                </div>
              </div>
              <div className='t2SettingsShortcutControls'>
                <div
                  aria-label={settings.summonShortcut.configuring ? 'Cancel shortcut edit' : 'Edit shortcut'}
                  className='t2SettingsSmallButton'
                  onClick={() => onUpdate('shortcut-configuring', !settings.summonShortcut.configuring)}
                  onKeyDown={(event) =>
                    activateOnKeyboard(event, () =>
                      onUpdate('shortcut-configuring', !settings.summonShortcut.configuring)
                    )
                  }
                  role='button'
                  tabIndex={0}
                >
                  {settings.summonShortcut.configuring ? 'Cancel' : 'Edit'}
                </div>
                <Toggle
                  label='Summon Shortcut'
                  on={settings.summonShortcut.enabled}
                  onToggle={() => onUpdate('shortcut-enabled', !settings.summonShortcut.enabled)}
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
          <div className='t2SettingsSectionTitle'>App</div>
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
              <div className='t2SettingsRowText'>
                <div className='t2SettingsRowTitle'>Reset All Settings & Data?</div>
              </div>
              <div className='t2SettingsConfirmActions'>
                <div
                  className='t2SettingsSmallButton t2SettingsDangerButton'
                  onClick={() => onReset('all-settings-data')}
                  role='button'
                  tabIndex={0}
                >
                  Yes
                </div>
                <div
                  className='t2SettingsSmallButton'
                  onClick={() => setResetConfirm(false)}
                  role='button'
                  tabIndex={0}
                >
                  No
                </div>
              </div>
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
          <div className='t2SettingsSectionTitle'>Signer Defaults</div>
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
            <div className='t2SettingsInputRow'>
              <input
                aria-label='Custom Lattice Relay'
                onChange={(event) => drafts.changeLatticeEndpoint(event.target.value)}
                placeholder='Custom Relay'
                spellCheck={false}
                value={drafts.latticeEndpoint}
              />
            </div>
          ) : null}
        </div>

        <div className='t2SettingsSection'>
          <div className='t2SettingsSectionTitle'>Tokens</div>
          <SettingsToggleRow
            detail={portfolioApiKeyDetail}
            label='Auto-Discover Tokens'
            on={settings.autoDiscoverTokens}
            onToggle={() => drafts.toggleAutoDiscoverTokens(settings.autoDiscoverTokens)}
          />
          <div className='t2SettingsInputRow'>
            <input
              aria-label='Zerion API Key'
              autoComplete='off'
              onChange={(event) => drafts.changePortfolioApiKey(event.target.value)}
              placeholder='Zerion API Key'
              spellCheck={false}
              type='password'
              value={drafts.portfolioApiKey}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
