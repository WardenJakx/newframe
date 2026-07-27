export const BUILT_IN_CHAIN_ICON_URLS: Readonly<Record<number, string>> = Object.freeze({
  1: 'https://chain-icons.s3.amazonaws.com/ethereum.png',
  10: 'https://frame.nyc3.cdn.digitaloceanspaces.com/icons/optimism.svg',
  56: 'https://chain-icons.s3.amazonaws.com/bsc.png',
  100: 'https://frame.nyc3.cdn.digitaloceanspaces.com/icons/gnosis.svg',
  137: 'https://frame.nyc3.cdn.digitaloceanspaces.com/icons/polygon.svg',
  143: 'https://chain-icons.s3.us-east-1.amazonaws.com/monad.png',
  999: 'https://chain-icons.s3.amazonaws.com/chainlist/999',
  8453: 'https://frame.nyc3.cdn.digitaloceanspaces.com/baseiconcolor.png',
  9745: 'https://chain-icons.s3.amazonaws.com/plasma.png',
  42161: 'https://frame.nyc3.cdn.digitaloceanspaces.com/icons/arbitrum.svg',
  43114: 'https://chain-icons.s3.amazonaws.com/avalanche.png',
  81457: 'https://chain-icons.s3.amazonaws.com/chainlist/81457',
  84532: 'https://frame.nyc3.cdn.digitaloceanspaces.com/baseiconcolor.png',
  11155111: 'https://chain-icons.s3.amazonaws.com/ethereum.png',
  11155420: 'https://frame.nyc3.cdn.digitaloceanspaces.com/icons/optimism.svg'
})

export function builtInChainIconUrl(chainId: number) {
  return BUILT_IN_CHAIN_ICON_URLS[chainId] || ''
}
