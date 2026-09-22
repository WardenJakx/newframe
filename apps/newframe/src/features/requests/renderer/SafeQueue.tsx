import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { AirGapRequestReference } from '../../../platform/signing/domain/airgap'
import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import { AddressIdentity, shortAddress } from '../../../shared/renderer/ui/AddressIdentity'
import { ChainIcon } from '../../../shared/renderer/ui/ChainIcon'
import { accountDisplayType } from '../../../shared/renderer/ui/signerPresentation'
import type { SafeOwnerAccount } from '../../accounts/domain/safe'
import { persistedImageSource } from '../../asset-data/domain/image'
import { NATIVE_CURRENCY } from '../../tokens/domain/constants'
import { useAssetRate, useOrigins, useTokens } from './Account/Requests/state'
import type { RequestRendererCapabilities } from './requestCapabilities'
import {
  useSafeConfirmation,
  useSafeProposalSimulation,
  useSafeTransactionActions
} from './useSafeConfirmation'

export function useSafeQueue({
  accountId,
  capabilities,
  onRecoverSigner,
  onAirGapSigning
}: {
  accountId: string
  capabilities: Pick<RequestRendererCapabilities, 'safe' | 'external'>
  onRecoverSigner?: (signerId: string) => void
  onAirGapSigning?: (reference: AirGapRequestReference) => void
}) {
  const { account, networks, metadata, accounts, currentProfile } = useWalletSelector(
    useShallow((state) => ({
      account: (state.accounts as Partial<typeof state.accounts>)[accountId],
      accounts: state.accounts as Partial<typeof state.accounts>,
      currentProfile: state.currentProfile,
      networks: state.networks.ethereum,
      metadata: state.networksMeta.ethereum
    }))
  )
  const safe = account?.profileId === currentProfile ? account.safe : undefined
  const hasSafe = !!safe && Object.keys(safe).length > 0
  const [selection, setSelection] = useState<{ chainId: number; hash: string; lifetime: number } | null>(null)
  const selectionLifetime = useRef(0)
  const [refreshing, setRefreshing] = useState(hasSafe)
  const [refreshError, setRefreshError] = useState<string>()
  const refreshScope = useRef<object | null>(null)
  useEffect(() => {
    refreshScope.current = {}
    if (!hasSafe) {
      return
    }
    let active = true
    void capabilities.safe
      .refresh({ accountId })
      .then((result) => {
        if (active && !result.ok) {
          setRefreshError(result.message ?? 'Could not refresh Safe queue')
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setRefreshError(error instanceof Error ? error.message : 'Could not refresh Safe queue')
        }
      })
      .finally(() => {
        if (active) {
          setRefreshing(false)
        }
      })
    return () => {
      active = false
      refreshScope.current = null
    }
  }, [accountId, capabilities.safe, hasSafe])
  const deployment = selection ? safe?.[String(selection.chainId)] : undefined
  const proposal = deployment?.pending?.find((item) => item.safeTxHash === selection?.hash)
  if (selection && !proposal) {
    setSelection(null)
  }
  const chainId = deployment?.chainId
  const owners = (deployment ? (account?.safeOwners?.[String(deployment.chainId)] ?? []) : []).filter(
    (owner) => {
      const ownerAccount = accounts[owner.accountId]
      return ownerAccount?.profileId === currentProfile && ownerAccount.created === owner.created
    }
  )
  const executors = (account?.safeExecutors ?? []).filter((executor) => {
    const executorAccount = accounts[executor.accountId]
    return executorAccount?.profileId === currentProfile && executorAccount.created === executor.created
  })
  const ownerScope =
    deployment && proposal
      ? JSON.stringify([
          accountId,
          account?.created,
          currentProfile,
          selection?.lifetime,
          chainId,
          deployment.address
        ])
      : ''
  const [ownerSelection, setOwnerSelection] = useState<{
    scope: string
    account: Pick<SafeOwnerAccount, 'accountId' | 'created'> | null
  }>({ scope: '', account: null })
  const selectedOwner =
    ownerSelection.scope === ownerScope
      ? owners.find(
          (owner) =>
            owner.accountId === ownerSelection.account?.accountId &&
            owner.created === ownerSelection.account.created &&
            owner.status !== 'watch-only'
        )
      : undefined
  if (ownerSelection.scope !== ownerScope) {
    const signingAccounts = owners.filter((owner) => owner.status !== 'watch-only')
    setOwnerSelection({
      scope: ownerScope,
      account:
        signingAccounts.length === 1
          ? { accountId: signingAccounts[0].accountId, created: signingAccounts[0].created }
          : null
    })
  } else if (ownerSelection.account && !selectedOwner) {
    setOwnerSelection({ scope: ownerScope, account: null })
  }
  const network = deployment ? networks[deployment.chainId] : undefined
  const { scope, preview } = useSafeProposalSimulation({
    accountId,
    scope: ownerScope,
    deployment,
    proposal,
    capability: capabilities.safe
  })
  const renderAddress = (address: string) => {
    const identity = Object.values(accounts).find(
      (account) => account?.address.toLowerCase() === address.toLowerCase()
    )
    return (
      <AddressIdentity
        address={address}
        accountType={accountDisplayType(identity)}
        clipboard={capabilities.external}
        nickname={identity?.name ?? shortAddress(address)}
        showFullAddress
      />
    )
  }
  const networkIcons = Object.fromEntries(
    Object.values(safe ?? {}).map((deployment) => [
      deployment.chainId,
      <ChainIcon
        key={deployment.chainId}
        chainId={deployment.chainId}
        networks={networks}
        networksMeta={metadata}
      />
    ])
  )
  const currency = deployment ? metadata[deployment.chainId]?.nativeCurrency : undefined
  const networkIcon = deployment ? persistedImageSource(metadata[deployment.chainId]?.image) : undefined
  const origins = useOrigins()
  const tokens = useTokens()
  const origin = proposal?.local?.origin
  const nativeCurrencyRate = useAssetRate({
    chainId: chainId ?? 1,
    address: NATIVE_CURRENCY,
    nativeTicker: currency?.symbol ?? network?.symbol ?? '?'
  })
  const confirmation = useSafeConfirmation({
    identity:
      deployment && proposal && selectedOwner
        ? {
            accountId,
            chainId: deployment.chainId,
            safeTxHash: proposal.safeTxHash,
            ownerId: selectedOwner.accountId
          }
        : undefined,
    scope: selectedOwner
      ? JSON.stringify([
          scope,
          selectedOwner.accountId,
          selectedOwner.created,
          accounts[selectedOwner.accountId]?.signer,
          deployment?.configuration.version,
          deployment?.configuration.nonce,
          deployment?.configuration.owners,
          deployment?.configuration.threshold,
          network
        ])
      : '',
    capability: capabilities.safe,
    onAirGapSigning
  })
  const actionChainId = deployment && proposal ? deployment.chainId : undefined
  const actionSafeTxHash = deployment && proposal ? proposal.safeTxHash : undefined
  const confirmOwner = useCallback(
    async (_ownerId: string, operationId: string) => confirmation.onSign(operationId),
    [confirmation]
  )
  const prepareExecutor = async (executorId: string) =>
    actionChainId && actionSafeTxHash
      ? capabilities.safe.prepareExecution({
          accountId,
          chainId: actionChainId,
          safeTxHash: actionSafeTxHash,
          executorId
        })
      : { ok: false as const, error: 'Safe proposal unavailable.' }
  const executeWith = async (
    executorId: string,
    adjustments: Parameters<RequestRendererCapabilities['safe']['execute']>[0]['adjustments'],
    operationId: string
  ) =>
    actionChainId && actionSafeTxHash
      ? capabilities.safe.execute({
          accountId,
          chainId: actionChainId,
          safeTxHash: actionSafeTxHash,
          executorId,
          operationId,
          action: 'execute-safe',
          ...(adjustments ? { adjustments } : {})
        })
      : { ok: false as const, error: 'operation_failed' as const, message: 'Safe proposal unavailable.' }
  const actionConfirmations = proposal
    ? [
        ...new Set([
          ...proposal.confirmations,
          ...(proposal.local?.confirmations.map(({ owner }) => owner) ?? [])
        ])
      ]
    : []
  const actionStatus = (() => {
    const executionStatus = proposal?.local?.execution.status
    if (executionStatus === 'submitted') {
      return 'submitted' as const
    }
    if (executionStatus === 'executing') {
      return 'executing' as const
    }
    if (executionStatus === 'preparing') {
      return 'preparing' as const
    }
    if (executionStatus === 'ready') {
      return 'ready' as const
    }
    if (executionStatus === 'failed' || executionStatus === 'cancelled') {
      return 'failed' as const
    }
    if (confirmation.status === 'submitted') {
      return 'submitted' as const
    }
    if (confirmation.status === 'executing') {
      return 'executing' as const
    }
    if (confirmation.status === 'preparing') {
      return 'preparing' as const
    }
    if (confirmation.status === 'ready') {
      return 'ready' as const
    }
    if (confirmation.status === 'failed') {
      return 'failed' as const
    }
    return 'collecting' as const
  })()
  const actions = useSafeTransactionActions({
    scope,
    status: actionStatus,
    confirmations: actionConfirmations,
    threshold: deployment?.configuration.threshold ?? 1,
    publication: proposal?.local?.publication.status ?? 'published',
    owners: owners.map((owner) => ({
      ...owner,
      accountType: accountDisplayType(accounts[owner.accountId])
    })),
    executors: executors.map((executor) => ({
      ...executor,
      accountType: accountDisplayType(accounts[executor.accountId])
    })),
    execution: proposal?.local?.execution,
    confirmation,
    canAct: proposal?.integrity?.status === 'matched',
    canExecute:
      proposal?.integrity?.status === 'matched' && proposal.nonce === deployment?.configuration.nonce,
    onConfirm: confirmOwner,
    onPrepare: prepareExecutor,
    onExecute: executeWith,
    controlledOwnerId: selectedOwner?.accountId,
    controlledOwnerSelection: true,
    onSelectControlledOwner: (accountId) => {
      const owner = owners.find((candidate) => candidate.accountId === accountId)
      if (owner) {
        setOwnerSelection({
          scope: ownerScope,
          account: { accountId: owner.accountId, created: owner.created }
        })
      }
    },
    onRecoverSigner: onRecoverSigner
      ? (ownerId) => {
          const signer = accounts[ownerId]?.signer
          if (signer) {
            onRecoverSigner(signer)
          }
        }
      : undefined
  })
  return {
    hasSafe,
    review:
      deployment && proposal
        ? {
            renderAddress,
            deployment,
            proposal,
            actions,
            simulation: preview,
            capabilities,
            networkName: network?.name ?? `Chain ${deployment.chainId}`,
            networkIcon,
            symbol: currency?.symbol ?? network?.symbol ?? 'native',
            decimals: currency?.decimals ?? 18,
            originName: origin ? origins[origin]?.name || origin : 'Safe proposal',
            favicon: origin ? persistedImageSource(origins[origin]?.image) : undefined,
            accountName: account?.name ?? account?.ensName,
            isTestnet: Boolean(network?.isTestnet),
            nativeCurrencyRate,
            tokens
          }
        : undefined,
    back: () => setSelection(null),
    queue: {
      networkIcons,
      deployments: Object.values(safe ?? {}),
      networkNames: Object.fromEntries(Object.entries(networks).map(([id, network]) => [id, network.name])),
      currencies: Object.fromEntries(
        Object.entries(networks).map(([id, network]) => [
          id,
          {
            symbol: (metadata[Number(id)]?.nativeCurrency?.symbol || network.symbol) ?? 'native',
            decimals: (metadata as Partial<typeof metadata>)[Number(id)]?.nativeCurrency?.decimals ?? 18
          }
        ])
      ),
      refreshing,
      refreshError,
      onSelect: (chainId: number, hash: string) =>
        setSelection({ chainId, hash, lifetime: ++selectionLifetime.current }),
      onRefresh: () => {
        const scope = refreshScope.current
        setRefreshing(true)
        setRefreshError(undefined)
        void capabilities.safe
          .refresh({ accountId, force: true })
          .then((result) => {
            if (scope === refreshScope.current && !result.ok) {
              setRefreshError(result.message ?? 'Could not refresh requests')
            }
          })
          .catch((error: unknown) => {
            if (scope === refreshScope.current) {
              setRefreshError(error instanceof Error ? error.message : 'Could not refresh requests')
            }
          })
          .finally(() => {
            if (scope === refreshScope.current) {
              setRefreshing(false)
            }
          })
      }
    }
  }
}
