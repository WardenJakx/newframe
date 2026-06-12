import React from 'react'
import Restore from 'react-restore'
import link from '../../../../../resources/link'

class Settings extends React.Component<any, any> {
  declare store: Store
  moduleRef: React.RefObject<HTMLDivElement | null>
  resizeObserver?: ResizeObserver
  nameObs: any

  constructor(props: any, context?: any) {
    super(props, context)
    this.moduleRef = React.createRef()
    if (!this.props.expanded) {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.moduleRef && this.moduleRef.current) {
          link.send('tray:action', 'updateAccountModule', this.props.moduleId, {
            height: this.moduleRef.current.clientHeight
          })
        }
      })
    }
    this.state = {
      expand: false,
      name: ''
    }
  }

  override componentDidMount() {
    if (this.resizeObserver) this.resizeObserver.observe(this.moduleRef.current as Element)
    this.nameObs = this.store.observer(() => {
      const name = this.store('main.accounts', this.props.account, 'name')
      if (name !== this.state.name) this.setState({ name })
    })
  }

  override componentWillUnmount() {
    if (this.resizeObserver) this.resizeObserver.disconnect()
    this.nameObs.remove()
  }

  override render() {
    return (
      <div className='accountViewScroll'>
        <div className='expandedModule'>
          <div className='panelBlock'>
            <div className='panelBlockTitle'>Name</div>
            <div className='panelBlockValues panelBlockItem'>
              <input
                type='text'
                tabIndex={-1}
                value={this.state.name}
                onChange={(e) => {
                  this.setState({ name: e.target.value })
                  link.send('tray:renameAccount', this.props.account, e.target.value)
                }}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }
}

export default Restore.connect(Settings)
