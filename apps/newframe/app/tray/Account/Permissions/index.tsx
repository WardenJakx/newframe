import React from 'react'
import Restore from 'react-restore'

import DappsPreview from './DappsPreview'
import DappsExpanded from './DappsExpanded'

class Dapps extends React.Component<any, any> {
  override render() {
    return this.props.expanded ? <DappsExpanded {...this.props} /> : <DappsPreview {...this.props} />
  }
}

export default Restore.connect(Dapps)
