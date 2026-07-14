import svg from '../../../resources/svg'
import { cachedImageUrl } from '../../domain/imageCache'

interface IconProps {
  svgName?: string
  alt?: string
  svgSize?: number
  img?: string
  small?: boolean
}

interface RingIconProps extends IconProps {
  block?: boolean
  color?: string
  noRing?: boolean
}

const Icon = ({ svgName, alt = '', svgSize = 16, img, small }: IconProps) => {
  if (img) {
    return <img src={cachedImageUrl(img)} alt={alt} />
  }
  if (svgName) {
    const iconName = svgName.toLowerCase()
    const ethChains = ['mainnet', 'görli', 'sepolia', 'ropsten', 'rinkeby', 'kovan']
    if (ethChains.includes(iconName)) {
      return svg.eth(small ? 13 : 18)
    }

    const svgIcon = (svg as any)[iconName]
    return svgIcon ? svgIcon(svgSize) : null
  }

  return svg.eth(small ? 13 : 18)
}

export default function RingIcon({ color, svgName, svgSize, img, small, block, noRing, alt }: RingIconProps) {
  let ringIconClass = 'ringIcon'
  if (small) ringIconClass += ' ringIconSmall'
  if (block) ringIconClass += ' ringIconBlock'
  if (noRing) ringIconClass += ' ringIconNoRing'
  return (
    <div className={ringIconClass} style={{ borderColor: color }}>
      <div className='ringIconInner' style={block ? { color } : { background: color }}>
        <Icon svgName={svgName} svgSize={svgSize} img={img} alt={alt} small={small} />
      </div>
    </div>
  )
}
