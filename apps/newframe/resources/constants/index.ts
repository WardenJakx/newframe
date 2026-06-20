export enum ApprovalType {
  OtherChainApproval = 'approveOtherChain',
  GasLimitApproval = 'approveGasLimit'
}

const NETWORK_PRESETS = {
  ethereum: {
    default: {
      local: 'direct'
    },
    1: {
      chainlist: 'https://ethereum-rpc.publicnode.com'
    },
    10: {
      chainlist: 'https://mainnet.optimism.io'
    },
    137: {
      chainlist: 'https://polygon-bor-rpc.publicnode.com'
    },
    8453: {
      chainlist: 'https://mainnet.base.org'
    },
    42161: {
      chainlist: 'https://arb1.arbitrum.io/rpc'
    },
    84532: {
      chainlist: 'https://sepolia.base.org'
    },
    11155111: {
      chainlist: 'https://ethereum-sepolia-rpc.publicnode.com'
    },
    11155420: {
      chainlist: 'https://sepolia.optimism.io'
    }
  }
}

const NATIVE_CURRENCY = '0x0000000000000000000000000000000000000000'
const MAX_HEX = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'

export { NETWORK_PRESETS, NATIVE_CURRENCY, MAX_HEX }
