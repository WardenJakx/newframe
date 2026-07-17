import { Icon } from '../icon/Icon.js'
import './selection.css'

export function SelectionChevron() {
  return (
    <span aria-hidden='true' className='nf-selection__chevron'>
      <Icon name='chevronUp' size='small' />
    </span>
  )
}
