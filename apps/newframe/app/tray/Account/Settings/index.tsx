import React from 'react'
import Restore from 'react-restore'

import SettingsPreview from './SettingsPreview'
import SettingsExpanded from './SettingsExpanded'

class Dapp extends React.Component<any, any> {
  override render() {
    return this.props.expanded ? <SettingsExpanded {...this.props} /> : <SettingsPreview {...this.props} />
  }
}

export default Restore.connect(Dapp)
