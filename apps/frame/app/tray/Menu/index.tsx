import React from 'react'
import Restore from 'react-restore'
import link from '../../../resources/link'
import svg from '../../../resources/svg'

class Menu extends React.Component<any, any> {
  declare store: Store
  declare clickTimer: any

  constructor(props: any, context?: any) {
    super(props, context)
    this.state = {
      glitchOnSend: false,
      glitchOnSidebar: false
    }
  }
  glitch(el: any, on: any) {
    return (
      <div className={on ? 'glitch glitchOn' : 'glitch'}>
        {[...Array(10).keys()].map((i) => (
          <div key={i + 'hg'} className='line'>
            {el}
          </div>
        ))}
        {!on ? <div className='line lastLine'>{el}</div> : null}
      </div>
    )
  }
  override render() {
    return (
      <div className='panelMenu'>
        <div
          className={'panelMenuItem panelMenuItemOpen'}
          onClick={() => {
            this.setState({ glitchOnSidebar: false })
            link.send('tray:action', 'setDash', {
              showing: !this.store('windows.dash.showing')
            })
          }}
          onMouseEnter={() => this.setState({ glitchOnSidebar: true })}
          onMouseOver={() => this.setState({ glitchOnSidebar: true })}
          onMouseLeave={() => this.setState({ glitchOnSidebar: false })}
        >
          {this.glitch(svg.sidebar(15), this.state.glitchOnSidebar)}
        </div>
        <div
          className={'panelMenuItem panelMenuItemSend'}
          onClick={() => {
            clearTimeout(this.clickTimer)
            this.clickTimer = setTimeout(() => {
              this.setState({ glitchOnSend: false })
              link.send('*:addFrame', 'dappLauncher')
              link.send('tray:action', 'setDash', { showing: false })
            }, 50)
          }}
          onMouseEnter={() => this.setState({ glitchOnSend: true })}
          onMouseOver={() => this.setState({ glitchOnSend: true })}
          onMouseLeave={() => this.setState({ glitchOnSend: false })}
        >
          {this.glitch(svg.send(15), this.state.glitchOnSend)}
        </div>
      </div>
    )
  }
}

export default Restore.connect(Menu)
