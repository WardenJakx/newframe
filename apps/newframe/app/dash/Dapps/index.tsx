import React, { createRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import link from '../../../resources/link'
import { isNetworkConnected, isNetworkEnabled } from '../../../resources/utils/chains'

import RingIcon from '../../../resources/Components/RingIcon'

import DappDetails from './DappDetails'
import { useWalletSelector } from '../../state/useAppSelector'
import type { DashChain, DashChainMetadata, DashRendererState } from '../state'
import type { Origin } from '../../../main/store/state'

function bySessionStartTime(a: any, b: any) {
  return b.session.startedAt - a.session.startedAt
}

const originFilter = ['newframe-internal', 'newframe-extension', 'frame-internal', 'frame-extension']

function getOriginsForChain(chain: any, origins: any) {
  const connectedOrigins = Object.entries(origins).reduce((acc: any, [id, origin]: [string, any]) => {
    if (origin.chain.id === chain.id && !originFilter.includes(origin.name)) {
      const connected =
        isNetworkConnected(chain) &&
        (!origin.session.endedAt || origin.session.startedAt > origin.session.endedAt)

      if (connected) acc.push({ ...origin, id })
    }

    return acc
  }, [] as any[])

  return {
    connected: connectedOrigins.sort(bySessionStartTime)
  }
}

class Indicator extends React.Component<any, any> {
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
    }

    return null
  }
}

class OriginModule extends React.Component<any, any> {
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
            void link.executeCommand({
              type: 'dash.navigate',
              view: 'dapps',
              data: { dappDetails: origin.id }
            })
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
      {origins.connected.length === 0 ? (
        <div className='sliceOriginNoDapp'>{'No Websites Connected'}</div>
      ) : null}
    </>
  )
}

const EMPTY_CHAINS: Record<string | number, DashChain> = {}
const EMPTY_CHAIN_METADATA: Record<string | number, DashChainMetadata> = {}
const EMPTY_ORIGINS: Record<string, Origin> = {}

const selectDappsState = (state: DashRendererState) => ({
  chains: state.networks.ethereum || EMPTY_CHAINS,
  chainMetadata: state.networksMeta.ethereum || EMPTY_CHAIN_METADATA,
  origins: state.origins || EMPTY_ORIGINS
})

export default function Dapps({ data }: any) {
  const { chains, chainMetadata, origins } = useWalletSelector(useShallow(selectDappsState))
  const enabledChains = Object.values(chains).filter(isNetworkEnabled)
  const { dappDetails } = data
  const chainsWithOrigins = enabledChains
    .map((chain) => {
      const chainOrigins = getOriginsForChain(chain, origins)
      const { primaryColor, icon } = chainMetadata[chain.id] || {}

      return { chain, origins: chainOrigins, primaryColor, icon }
    })
    .filter(({ origins: chainOrigins }) => chainOrigins.connected.length > 0)

  if (dappDetails) {
    return <DappDetails originId={dappDetails} />
  }

  return (
    <div className='cardShow' style={{ padding: '0px 0px 64px 0px' }}>
      {chainsWithOrigins.length ? (
        <div
          className='clearOriginsButton'
          onClick={() => void link.executeCommand({ type: 'origin.clear' })}
        >
          Clear All Websites
        </div>
      ) : null}
      {chainsWithOrigins.map(({ chain, origins: chainOrigins, primaryColor, icon }) => (
        <ChainOrigins
          key={chain.id}
          chain={chain}
          origins={chainOrigins}
          primaryColor={primaryColor}
          icon={icon}
        />
      ))}
      {chainsWithOrigins.length === 0 ? (
        <div className='sliceOriginNoDapp'>{'No Websites Connected'}</div>
      ) : null}
    </div>
  )
}
