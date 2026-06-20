import React from 'react'
import Restore from 'react-restore'

import link from '../../../resources/link'
import svg from '../../../resources/svg'

class Main extends React.Component<any, any> {
  override render() {
    return (
      <div className={'localSettings cardShow'}>
        <div className='localSettingsWrap'>
          <div className='dashModules'>
            <div
              className='dashModule'
              onClick={() => link.send('tray:action', 'navHome', { view: 'accounts', data: {} })}
            >
              <div className='dashModuleIcon'>{svg.accounts(24)}</div>
              <div className='dashModuleTitle'>{'Accounts'}</div>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

export default Restore.connect(Main)
