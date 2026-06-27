import React from 'react'
import Restore from 'react-restore'

// import Account from './Account'
// import TxBar from './TxBar'
// import TxConfirmations from './TxConfirmations'

// import svg from '../../../resources/svg'
// import link from '../../../resources/link'

// import { usesBaseFee } from '../../../resources/domain/transaction'

// const FEE_WARNING_THRESHOLD_USD = 50

class Time extends React.Component<any, any> {
  constructor(props: any, context?: any) {
    super(props, context)
    this.state = {
      time: Date.now()
    }
    setInterval(() => {
      this.setState({ time: Date.now() })
    }, 1000)
  }

  msToTime(duration: any) {
    const seconds = Math.floor((duration / 1000) % 60)
    const minutes = Math.floor((duration / (1000 * 60)) % 60)
    const hours = Math.floor((duration / (1000 * 60 * 60)) % 24)
    if (hours) {
      return { time: hours, label: hours === 1 ? 'hour ago' : 'hours ago' }
    } else if (minutes) {
      return { time: minutes, label: minutes === 1 ? 'minute ago' : 'minutes ago' }
    }
    return { time: seconds, label: 'seconds ago' }
  }

  override render() {
    const { time, label } = this.msToTime(this.state.time - this.props.time)
    return (
      <div className='txProgressSuccessItem txProgressSuccessItemRight'>
        <div className='txProgressSuccessItemValue'>{time}</div>
        <div className='txProgressSuccessItemLabel'>{label}</div>
      </div>
    )
  }
}

export default Restore.connect(Time)
