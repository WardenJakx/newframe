import AddToken from './AddToken'
import CustomTokens from './CustomTokens'
import { useWalletSelector } from '../../state/useAppSelector'
import type { DashNavigationData, DashRendererState } from '../state'

interface TokensProps {
  data: DashNavigationData
}

const selectNotifyData = (state: DashRendererState) => state.view?.notifyData

export default function Tokens({ data }: TokensProps) {
  const request = useWalletSelector(selectNotifyData)

  return <>{data.notify === 'addToken' ? <AddToken req={request} data={data} /> : <CustomTokens />}</>
}
