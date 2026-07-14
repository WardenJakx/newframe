import Command from './Command'
import Main from './Main'
import Signer from './Signer'
import Notify from './Notify'
import Dapps from './Dapps'
import Tokens from './Tokens'
import svg from '../../resources/svg'
import link from '../../resources/link'
import { capitalize } from '../../resources/utils'
import { useWalletSelector } from '../state/useAppSelector'
import type { DashNavigationData, DashNavigationEntry, DashRendererState } from './state'

const EMPTY_DASH_NAV: DashNavigationEntry[] = []

const selectDashNavigation = (state: DashRendererState) => state.windows?.dash?.nav || EMPTY_DASH_NAV

function itemName(view: string) {
  return capitalize(view.slice(0, -1))
}

interface AddNewItemButtonProps {
  view: string
  req?: unknown
}

const AddNewItemButton = ({ view, req }: AddNewItemButtonProps) => {
  const dataMap: Record<string, any> = {
    tokens: req === undefined ? { notify: 'addToken' } : { notify: 'addToken', notifyData: req }
  }

  return (
    <div className='dashFooter'>
      <div
        className='dashFooterButton'
        onClick={() =>
          void link.executeCommand({ type: 'dash.navigate', view: 'tokens', data: dataMap[view] })
        }
      >
        <div className='newAccountIcon'>{svg.plus(16)}</div>
        Add New {itemName(view)}
      </div>
    </div>
  )
}

interface DashProps {
  req?: unknown
}

function renderPanel(view: string, data: DashNavigationData) {
  if (view === 'expandedSigner' && data.signer) {
    return <Signer key={data.signer} id={data.signer} expanded={true} />
  }
  if (view === 'dapps') return <Dapps data={data} />
  if (view === 'tokens') return <Tokens data={data} />
  if (view === 'notify') return <Notify data={data} />
  return <Main />
}

export default function Dash({ req }: DashProps) {
  const navigation = useWalletSelector(selectDashNavigation)
  const { view = 'default', data = {} } = navigation[0] || {}
  const showAddButton = view === 'tokens' && Object.keys(data).length === 0

  return (
    <div className='dash'>
      <Command />
      <div className='dashMain' style={{ bottom: showAddButton ? '120px' : '40px' }}>
        <div className='dashMainOverlay' />
        <div className='dashMainScroll'>{renderPanel(view, data)}</div>
      </div>
      {showAddButton && <AddNewItemButton view={view} req={req} />}
    </div>
  )
}
