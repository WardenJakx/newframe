import { forwardRef, type ForwardedRef, type SVGProps } from 'react'

const Component = (props: SVGProps<SVGSVGElement>, ref: ForwardedRef<SVGSVGElement>) => (
  <svg ref={ref} {...props} />
)

const ReactComponent = forwardRef(Component)

exports = {
  ReactComponent,
  default: 'file.svg'
}
