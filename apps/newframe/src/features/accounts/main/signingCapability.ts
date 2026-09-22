import { SignTypedDataVersion } from '@metamask/eth-sig-util'

import { getSignerType, isSignerReady, Type as SignerType } from '../../../platform/signing/domain/index.js'
import type {
  SignatureRequest,
  SigningCapability,
  SigningCandidate
} from '../../requests/contract/requests.js'
import type { SafeDeployment } from '../domain/safe.js'
import type { Account } from '../domain/state/account.js'

type SignerSummary = {
  id?: string
  type: string
  status: string
  addresses?: string[]
}

const v4Only = new Set<string>([SignerType.Ledger, SignerType.Trezor, SignerType.AirGap])

function firstNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    if (value) {
      return value
    }
  }
  return ''
}

function supportsTypedVersion(type: string, version?: SignTypedDataVersion) {
  if (!version) {
    return true
  }
  const signerType = getSignerType(type.toLowerCase())
  if (!signerType) {
    return false
  }
  if (v4Only.has(signerType)) {
    return version === SignTypedDataVersion.V4
  }
  if (signerType === SignerType.Lattice) {
    return version === SignTypedDataVersion.V3 || version === SignTypedDataVersion.V4
  }
  return true
}

export function deriveSigningCandidate(
  account: Account,
  signers: Record<string, SignerSummary | undefined>,
  appLock: { locked: boolean },
  version?: SignTypedDataVersion
): SigningCandidate {
  const signer = account.signer ? signers[account.signer] : undefined
  const type = firstNonEmpty(signer?.type, account.lastSignerType, 'address').toLowerCase()
  const attachedType = signer ? getSignerType(signer.type.toLowerCase()) : undefined
  const historicalType = getSignerType(account.lastSignerType.toLowerCase())
  const signerOwnsAddress =
    !signer?.addresses?.length ||
    signer.addresses.some((address) => address.toLowerCase() === account.address.toLowerCase())
  const attached = Boolean(signer && attachedType && signerOwnsAddress)
  const watchOnly =
    !attachedType && !historicalType && (!account.signer || signer?.type.toLowerCase() === 'address')
  const versionSupported = supportsTypedVersion(type, version)

  let status: SigningCandidate['status'] = 'unavailable'
  if (watchOnly) {
    status = 'watch-only'
  } else if (attached && isSignerReady(signer!) && !appLock.locked && versionSupported) {
    status = 'ready'
  }

  let signerStatus = firstNonEmpty(signer?.status, 'Signer unavailable')
  if (status === 'watch-only') {
    signerStatus = 'Watch-only account'
  } else if (appLock.locked) {
    signerStatus = 'Wallet locked'
  } else if (!versionSupported) {
    signerStatus = `Signer does not support typed data ${version}`
  } else if (!attached && (!signer || isSignerReady(signer))) {
    signerStatus = 'Signer unavailable'
  }

  return {
    accountId: account.id,
    name: account.name,
    address: account.address,
    created: account.created,
    signerType: type,
    signerAttached: attached,
    signerStatus,
    status
  }
}

export function safeOwnerCandidates(
  safeAccount: Account,
  chainId: number,
  accounts: Account[],
  signers: Record<string, SignerSummary | undefined>,
  appLock: { locked: boolean }
): SigningCandidate[] {
  const deployment = safeAccount.safe?.[String(chainId)]
  if (!deployment) {
    return []
  }
  const owners = new Set(deployment.configuration.owners.map((address) => address.toLowerCase()))
  return (
    accounts
      .filter(
        (account) =>
          account.profileId === safeAccount.profileId &&
          account.safe === undefined &&
          owners.has(account.address.toLowerCase())
      )
      // Owners sign the V4 SafeMessage envelope, including for a V1 original message.
      .map((account) => deriveSigningCandidate(account, signers, appLock, SignTypedDataVersion.V4))
  )
}

export function safeExecutorCandidates(
  safeAccount: Account,
  accounts: Account[],
  signers: Record<string, SignerSummary | undefined>,
  appLock: { locked: boolean }
): SigningCandidate[] {
  return accounts
    .filter((account) => account.profileId === safeAccount.profileId && account.safe === undefined)
    .map((account) => deriveSigningCandidate(account, signers, appLock))
}

export function deriveSigningCapability(
  request: SignatureRequest,
  accounts: Account[],
  signers: Record<string, SignerSummary | undefined>,
  appLock: { locked: boolean },
  currentProfile: string
): SigningCapability {
  const account = accounts.find((candidate) => candidate.id === request.account)
  const version = 'typedMessage' in request ? request.typedMessage.version : undefined
  if (!account || account.profileId !== currentProfile) {
    return { type: 'direct', status: 'unavailable', candidates: [] }
  }
  if (!account.safe) {
    const candidate = deriveSigningCandidate(account, signers, appLock, version)
    return { type: 'direct', status: candidate.status, candidates: [candidate] }
  }

  const chainId = String(request.chainId)
  const deployments: Record<string, SafeDeployment | undefined> = account.safe
  const deployment = deployments[chainId]
  const candidates = safeOwnerCandidates(account, request.chainId, accounts, signers, appLock)
  return {
    type: 'safe',
    status: candidates.some((candidate) => candidate.status === 'ready') ? 'ready' : 'unavailable',
    chainId: request.chainId,
    configured: deployment !== undefined,
    threshold: deployment?.configuration.threshold ?? 0,
    coordination: version === SignTypedDataVersion.V1 ? 'local-only' : 'service',
    candidates
  }
}
