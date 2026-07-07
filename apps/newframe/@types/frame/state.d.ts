type HexAmount = string

interface Frame {
  id: string
  route?: string
}

type SignerType = 'ring' | 'seed' | 'address' | 'trezor' | 'ledger' | 'lattice'
type AccountStatus = 'ok'

interface Signer {
  id: string
  name: string
  model: string
  type: SignerType
  addresses: Address[]
  status: string
  createdAt: number
  encryptionVersion?: number
}

interface Account {
  id: string
  name: string
  lastSignerType: SignerType
  active: boolean
  address: Address
  status: AccountStatus
  signer: string
  signerStatus?: string
  requests: Record<string, any>
  ensName: string
  created: string
  balances: {
    lastUpdated?: number
  }
}
