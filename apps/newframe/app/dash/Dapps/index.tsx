import React, { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import link from '../../../resources/link'
import { isNetworkConnected, isNetworkEnabled } from '../../../resources/utils/chains'

import RingIcon from '../../../resources/Components/RingIcon'

import DappDetails from './DappDetails'
import { useWalletSelector } from '../../state/useAppSelector'
import type { DashChain, DashChainMetadata, DashRendererState } from '../state'
import type { Origin } from '../../../main/store/state'

type ConnectedOrigin = Origin & { id: string }

type IndicatorProps = {
  connected: boolean
}

type OriginModuleProps = IndicatorProps & {
  origin: ConnectedOrigin
}

type ChainOriginsProps = {
  chain: DashChain
  origins: { connected: ConnectedOrigin[] }
  primaryColor?: string
  icon?: string
}

type DappsProps = {
  data?: { dappDetails?: string }
}

function bySessionStartTime(a: ConnectedOrigin, b: ConnectedOrigin) {
  return b.session.startedAt - a.session.startedAt
}

const originFilter = ['newframe-internal', 'newframe-extension', 'frame-internal', 'frame-extension']

function getOriginsForChain(chain: DashChain, origins: Record<string, Origin>) {
  const connectedOrigins = Object.entries(origins).reduce<ConnectedOrigin[]>((acc, [id, origin]) => {
    if (origin.chain.id === chain.id && !originFilter.includes(origin.name)) {
      const connected =
        isNetworkConnected(chain) &&
        (!origin.session.endedAt || origin.session.startedAt > origin.session.endedAt)

      if (connected) acc.push({ ...origin, id })
    }

    return acc
  }, [])

  return {
    connected: connectedOrigins.sort(bySessionStartTime)
  }
}

function Indicator({ connected }: IndicatorProps) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const activate = setTimeout(() => setActive(true), 20)
    const deactivate = setTimeout(() => setActive(false), 200)
    return () => {
      clearTimeout(activate)
      clearTimeout(deactivate)
    }
  }, [])

  if (connected) {
    return (
      <div className={active ? 'sliceOriginIndicator sliceOriginIndicatorActive' : 'sliceOriginIndicator'} />
    )
  }

  return null
}

function OriginModule({ origin, connected }: OriginModuleProps) {
  const [averageRequests, setAverageRequests] = useState('0.0')

  useEffect(() => {
    const updateRequestRate = () => {
      if (connected) {
        const now = new Date().getTime()
        const sessionLength = now - origin.session.startedAt
        const sessionLengthSeconds = sessionLength / Math.min(sessionLength, 1000)
        setAverageRequests((origin.session.requests / sessionLengthSeconds).toFixed(2))
      }
    }
    const requestUpdates = setInterval(updateRequestRate, 1000)
    return () => clearInterval(requestUpdates)
  }, [connected, origin])

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
          <div className='sliceOriginReqsNumber'>{averageRequests}</div>
          <div className='sliceOriginReqsLabel'>{'reqs/min'}</div>
        </div>
      </div>
    </div>
  )
}

const ChainOrigins = ({ chain: { name }, origins, primaryColor, icon }: ChainOriginsProps) => {
  return (
    <>
      <div className='originTitle'>
        <div className='originTitleIcon'>
          <RingIcon small={true} color={`var(--${primaryColor})`} img={icon} />
        </div>
        <div className='originTitleText'>{name}</div>
      </div>
      {origins.connected.map((origin) => (
        <OriginModule key={origin.id} origin={origin} connected={true} />
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

export default function Dapps({ data = {} }: DappsProps) {
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
