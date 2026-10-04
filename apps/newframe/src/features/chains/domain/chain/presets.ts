import { BUILT_IN_CHAINS } from './catalog.ts'

const chainlist = Object.fromEntries(
  BUILT_IN_CHAINS.filter(({ rpc }) => rpc.preset === 'chainlist').map(({ id, rpc }) => [
    id,
    { chainlist: rpc.url }
  ])
)

export const CHAIN_PRESETS = {
  ethereum: { default: { local: 'direct' }, ...chainlist }
}
