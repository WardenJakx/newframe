import { css } from '../styled-system/css/css.js'

const spacerClass = css({ flex: '1 1 auto', minHeight: 0 })

export function Spacer() {
  return <div aria-hidden='true' className={spacerClass} />
}
