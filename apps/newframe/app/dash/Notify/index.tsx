import AddToken from './AddToken'
import type { DashNavigationData } from '../state'

export default function Notify({ data }: { data: DashNavigationData }) {
  if (data.notify !== 'addToken') return null

  return (
    <div className='notify cardShow'>
      <div className='notifyBoxWrap' onMouseDown={(event) => event.stopPropagation()}>
        <div className='notifyBoxSlide'>
          <AddToken {...data.notifyData} />
        </div>
      </div>
    </div>
  )
}
