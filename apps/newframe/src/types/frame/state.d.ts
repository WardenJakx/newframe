type HexAmount = string

interface Frame {
  id: string
  route?: string
}

type SignerType = 'ring' | 'seed' | 'address' | 'trezor' | 'ledger' | 'lattice' | 'airgap'
type AccountStatus = 'ok'

interface Signer {
  airgapRequest?: import('../../platform/signing/domain/airgap.js').AirGapPendingSummary
  id: string
  name: string
  model: string
  type: SignerType
  addresses: Address[]
  status: string
  createdAt: number
}

interface Account {
  safe?: Record<string, import('../../features/accounts/domain/safe.js').SafeDeployment>
  id: string
  name: string
  lastSignerType: SignerType
  address: Address
  status: AccountStatus
  signer: string
  signerStatus?: string
  agentEnabled?: boolean
  requests: Record<string, any>
  ensName: string
  created: string
  balances: {
    lastUpdated?: number
  }
}
