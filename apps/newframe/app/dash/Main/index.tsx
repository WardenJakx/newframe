import link from '../../../resources/link'
import svg from '../../../resources/svg'

export default function Main() {
  return (
    <div className={'localSettings cardShow'}>
      <div className='localSettingsWrap'>
        <div className='dashModules'>
          <div
            className='dashModule'
            onClick={() => void link.executeCommand({ type: 'wallet.navigate-home', view: 'accounts' })}
          >
            <div className='dashModuleIcon'>{svg.accounts(24)}</div>
            <div className='dashModuleTitle'>{'Accounts'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
