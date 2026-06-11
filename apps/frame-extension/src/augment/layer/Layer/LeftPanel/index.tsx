import React from 'react'
import Restore from 'react-restore'

import Inventory from './Inventory'
import User from './User'

import { PopLeft } from './styled'

class LeftPanel extends React.Component<any, any> {
  constructor (...args: [any]) {
    super(...args)
    this.state = {}
  }
  override render () {
    return (
      <PopLeft>
        <User />
        <Inventory />
      </PopLeft>
    )
  }
}

export default Restore.connect(LeftPanel)