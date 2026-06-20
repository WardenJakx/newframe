import React from 'react'
import Restore from 'react-restore'
import link from '../../../../resources/link'
import svg from '../../../../resources/svg'

class Activity extends React.Component<any, any> {
  moduleRef: React.RefObject<HTMLDivElement | null>
  resizeObserver: ResizeObserver

  constructor(props: any, context?: any) {
    super(props, context)
    this.moduleRef = React.createRef()
    this.resizeObserver = new ResizeObserver(() => {
      if (this.moduleRef && this.moduleRef.current) {
        link.send('tray:action', 'updateAccountModule', this.props.moduleId, {
          height: this.moduleRef.current.clientHeight
        })
      }
    })
    this.state = {
      expand: false
    }
  }
  override componentDidMount() {
    this.resizeObserver.observe(this.moduleRef.current as Element)
  }
  override render() {
    return (
      <div ref={this.moduleRef} className='balancesBlock'>
        <div className='moduleHeader'>
          <span>{svg.inbox(13)}</span>
          <span>{'Activity'}</span>
        </div>
        <div className='moduleComingSoon'>{'Coming Soon'}</div>
      </div>
    )
  }
}

export default Restore.connect(Activity)
