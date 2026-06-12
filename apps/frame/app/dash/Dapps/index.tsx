import React, { createRef } from 'react'
import Restore from 'react-restore'
import link from '../../../resources/link'
import { isNetworkConnected, isNetworkEnabled } from '../../../resources/utils/chains'
// import svg from '../../../resources/svg'

import RingIcon from '../../../resources/Components/RingIcon'

import DappDetails from './DappDetails'

function bySessionStartTime(a: any, b: any) {
  return b.session.startedAt - a.session.startedAt
}

function byLastUpdated(a: any, b: any) {
  return b.session.lastUpdatedAt - a.session.lastUpdatedAt
}

const originFilter = ['frame-internal', 'frame-extension']

function getOriginsForChain(chain: any, origins: any) {
  const { connectedOrigins, disconnectedOrigins } = Object.entries(origins).reduce(
    (acc: any, [id, origin]: [string, any]) => {
      if (origin.chain.id === chain.id && !originFilter.includes(origin.name)) {
        const connected =
          isNetworkConnected(chain) &&
          (!origin.session.endedAt || origin.session.startedAt > origin.session.endedAt)

        acc[connected ? 'connectedOrigins' : 'disconnectedOrigins'].push({ ...origin, id })
      }

      return acc
    },
    { connectedOrigins: [] as any[], disconnectedOrigins: [] as any[] }
  )

  return {
    connected: connectedOrigins.sort(bySessionStartTime),
    disconnected: disconnectedOrigins
      .sort(byLastUpdated)
      .filter((origin: any) => Date.now() - origin.session.lastUpdatedAt < 60 * 60 * 1000)
  }
}

class Indicator extends React.Component<any, any> {
  declare store: Store

  constructor(props: any) {
    super(props)

    this.state = {
      active: false
    }

    setTimeout(() => {
      this.setState({ active: true })
    }, 20)

    setTimeout(() => {
      this.setState({ active: false })
    }, 200)
  }

  override render() {
    if (this.props.connected) {
      return (
        <div
          className={
            this.state.active ? 'sliceOriginIndicator sliceOriginIndicatorActive' : 'sliceOriginIndicator'
          }
        />
      )
    } else {
      return <div className='sliceOriginIndicator sliceOriginIndicatorOff' />
    }
  }
}

class _OriginModule extends React.Component<any, any> {
  declare store: Store
  ref: any
  requestUpdates: any

  constructor(props: any, context?: any) {
    super(props, context)

    this.state = {
      expanded: false,
      averageRequests: '0.0'
    }

    this.ref = createRef()
  }

  override componentDidMount() {
    this.requestUpdates = setInterval(() => {
      if (this.props.connected) {
        this.updateRequestRate()
      }
    }, 1000)
  }

  override componentWillUnmount() {
    clearInterval(this.requestUpdates)
  }

  updateRequestRate() {
    const { origin } = this.props
    const now = new Date().getTime()
    const sessionLength = now - origin.session.startedAt
    const sessionLengthSeconds = sessionLength / Math.min(sessionLength, 1000)
    this.setState({ averageRequests: (origin.session.requests / sessionLengthSeconds).toFixed(2) })
  }

  override render() {
    const { origin, connected } = this.props

    return (
      <div>
        <div
          className='sliceOrigin'
          onClick={() => {
            link.send('tray:action', 'navDash', { view: 'dapps', data: { dappDetails: origin.id } })
          }}
        >
          <Indicator key={origin.session.lastUpdatedAt} connected={connected} />
          <div className='sliceOriginTitle'>{origin.name}</div>
          <div className='sliceOriginReqs'>
            <div className='sliceOriginReqsNumber'>{this.state.averageRequests}</div>
            <div className='sliceOriginReqsLabel'>{'reqs/min'}</div>
          </div>
        </div>
        {this.state.expanded ? <div>{'origin quick menu'}</div> : null}
      </div>
    )
  }
}

const OriginModule = Restore.connect(_OriginModule)

const ChainOrigins = ({ chain: { name }, origins, primaryColor, icon }: any) => {
  return (
    <>
      <div className='originTitle'>
        <div className='originTitleIcon'>
          <RingIcon small={true} color={`var(--${primaryColor})`} img={icon} />
        </div>
        <div className='originTitleText'>{name}</div>
      </div>
      {origins.connected.map((origin: any) => (
        <OriginModule key={origin} origin={origin} connected={true} />
      ))}
      {origins.disconnected.map((origin: any) => (
        <OriginModule key={origin} origin={origin} connected={false} />
      ))}
      {origins.connected.length === 0 && origins.disconnected.length === 0 ? (
        <div className='sliceOriginNoDapp'>{'No Dapp Recently Connected'}</div>
      ) : null}
    </>
  )
}

class Dapps extends React.Component<any, any> {
  declare store: Store

  getEnabledChains() {
    return (Object.values(this.store('main.networks.ethereum')) as any[]).filter(isNetworkEnabled)
  }

  override render() {
    const enabledChains = this.getEnabledChains()
    const origins = this.store('main.origins')

    const { dappDetails } = this.props.data

    if (dappDetails) {
      return <DappDetails originId={dappDetails} />
    } else {
      return (
        <div className='cardShow' style={{ padding: '0px 0px 64px 0px' }}>
          {enabledChains.map((chain) => {
            const chainOrigins = getOriginsForChain(chain, origins)
            const { primaryColor, icon } = this.store('main.networksMeta.ethereum', chain.id)

            // NOTE: preserved pre-existing behavior — chainOrigins has no `length`
            // property at runtime, so this condition is always false
            return (chainOrigins as any).length === 0 ? (
              <></>
            ) : (
              <ChainOrigins
                key={chain.id}
                chain={chain}
                origins={chainOrigins}
                primaryColor={primaryColor}
                icon={icon}
              />
            )
          })}
        </div>
      )
    }
  }
}

export default Restore.connect(Dapps)
