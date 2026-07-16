import svg from '../../../../../resources/svg'
import { SettingsActionRow } from '../../ui/SettingsRow'
import { activateOnKeyboard } from '../../ui/keyboard'

export function AboutView({
  copied,
  instanceId,
  onBack,
  onCopyInstanceId,
  onViewLicense,
  version
}: {
  copied: boolean
  instanceId: string
  onBack: () => void
  onCopyInstanceId: () => void
  onViewLicense: () => void
  version: string
}) {
  return (
    <div aria-label='App Info' className='t2Overlay cardShow' role='dialog'>
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
        <div className='t2OverlayTitle'>App Info</div>
        <div className='t2OverlaySpacer' />
      </div>
      <div className='t2OverlayScroll t2SettingsScroll'>
        <div className='t2SettingsSection'>
          <div
            aria-label='Copy instance ID'
            className='t2InfoRow t2InfoCopyRow'
            onClick={onCopyInstanceId}
            onKeyDown={(event) => activateOnKeyboard(event, onCopyInstanceId)}
            role='button'
            tabIndex={0}
          >
            <div className='t2InfoLabel'>Instance ID</div>
            <div className='t2InfoValue t2InfoValueMono'>{copied ? 'Instance ID Copied' : instanceId}</div>
          </div>
          <div className='t2InfoRow'>
            <div className='t2InfoLabel'>Version</div>
            <div className='t2InfoValue'>{`v${version}`}</div>
          </div>
          <SettingsActionRow action='Open' label='View License' onAction={onViewLicense} />
        </div>
      </div>
    </div>
  )
}
