import { forwardRef } from 'react'

const Component = (props: any = {}, ref: any = {}) => <svg ref={ref} {...props} />

const ReactComponent = forwardRef(Component)

exports = {
  ReactComponent,
  default: 'file.svg'
}
