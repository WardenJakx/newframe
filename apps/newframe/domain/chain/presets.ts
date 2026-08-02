import { BUILT_IN_CHAINS } from './catalog.js'

const chainlist = Object.fromEntries(
  BUILT_IN_CHAINS.filter(({ rpc }) => rpc.preset === 'chainlist').map(({ id, rpc }) => [
    id,
    { chainlist: rpc.url }
  ])
)

export const NETWORK_PRESETS = {
  ethereum: { default: { local: 'direct' }, ...chainlist }
}
