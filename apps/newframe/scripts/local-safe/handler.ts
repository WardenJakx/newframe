import { TypedDataEncoder, ZeroAddress } from 'ethers'

import {
  safeAddressSchema,
  safeConfigurationSchema,
  safeProposalSchema,
  type SafeProposal
} from '../../src/features/accounts/domain/safe.js'
import { verifySafeConfirmation, verifySafeHash } from '../../src/platform/safe/integrity.js'

export function createSafeHandler(options: {
  chainId: number
  safe: string
  owners: string[]
  threshold: number
  version?: string
  nonce?: string
  includeMismatch?: boolean
  pageSize?: number
  proposals?: SafeProposal[]
}) {
  if (!Number.isSafeInteger(options.chainId) || options.chainId <= 0) {
    throw new Error('Invalid Safe chain ID')
  }
  const safe = safeAddressSchema.parse(options.safe)
  const configuration = safeConfigurationSchema.parse({
    owners: options.owners,
    threshold: options.threshold,
    nonce: options.nonce ?? '0',
    version: options.version ?? '1.4.1'
  })
  const proposals = (
    options.proposals ??
    Array.from({ length: options.includeMismatch ? 5 : 4 }, (_, index) => {
      let data = '0x'
      if (index === 3) {
        data = '0xdeadbeef00112233'
      } else if (index === 2) {
        data = `0xa9059cbb${configuration.owners[0].slice(2).toLowerCase().padStart(64, '0')}${'1'.padStart(64, '0')}`
      }

      return {
        safeTxHash: `0x${'0'.repeat(64)}`,
        safeTxGas: '0',
        baseGas: '0',
        gasPrice: '0',
        gasToken: ZeroAddress,
        refundReceiver: ZeroAddress,
        safe,
        nonce: (BigInt(configuration.nonce) + BigInt(index > 1 ? index - 1 : 0)).toString(),
        to: configuration.owners[0],
        value: index === 0 ? '1000000000000000000' : '0',
        operation: index === 3 ? 1 : 0,
        data,
        ...(index === 2
          ? {
              dataDecoded: {
                method: 'transfer',
                parameters: [
                  { name: 'to', type: 'address', value: configuration.owners[0] },
                  { name: 'value', type: 'uint256', value: '1' }
                ]
              }
            }
          : {}),
        confirmations:
          index === 0 ? [] : configuration.owners.slice(0, index === 1 ? configuration.threshold : 1)
      }
    }).map((proposal) => ({
      ...proposal,
      safeTxHash: TypedDataEncoder.hash(
        {
          verifyingContract: safe,
          ...(['1.1.1', '1.2.0'].includes(configuration.version ?? '') ? {} : { chainId: options.chainId })
        },
        {
          SafeTx: [
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'data', type: 'bytes' },
            { name: 'operation', type: 'uint8' },
            { name: 'safeTxGas', type: 'uint256' },
            { name: 'baseGas', type: 'uint256' },
            { name: 'gasPrice', type: 'uint256' },
            { name: 'gasToken', type: 'address' },
            { name: 'refundReceiver', type: 'address' },
            { name: 'nonce', type: 'uint256' }
          ]
        },
        proposal
      )
    }))
  ).map((proposal) => safeProposalSchema.parse(proposal))
  if (options.includeMismatch && !options.proposals) {
    proposals[4].value = '123'
  } // Deliberate payload-only tampering.
  const pageSize = options.pageSize ?? 2
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new Error('Invalid page size')
  }
  const requests: string[] = []
  const confirmations = new Map<string, Map<string, string>>()
  let failure: { status: number; retryAfter?: string; offset?: number } | undefined
  const controls = {
    requests,
    reset() {
      requests.length = 0
      failure = undefined
    },
    failNext(status: number, retryAfter?: string, offset?: number) {
      failure = { status, retryAfter, offset }
    },
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url)
      requests.push(url.pathname + url.search)
      if (
        failure &&
        (failure.offset === undefined || Number(url.searchParams.get('offset') ?? 0) === failure.offset)
      ) {
        const current = failure
        failure = undefined
        return Response.json(
          { error: 'Injected Safe service failure' },
          {
            status: current.status,
            headers: current.retryAfter ? { 'Retry-After': current.retryAfter } : undefined
          }
        )
      }
      const confirmationRoute = /^\/api\/v1\/multisig-transactions\/(0x[0-9a-f]{64})\/confirmations\/$/i.exec(
        url.pathname
      )
      if (confirmationRoute) {
        const hash = confirmationRoute[1].toLowerCase()
        const proposal = proposals.find((proposal) => proposal.safeTxHash === hash)
        if (request.method === 'POST') {
          if (!proposal) {
            return Response.json({ error: 'Transaction not found' }, { status: 404 })
          }
          let body: unknown
          try {
            body = await request.json()
          } catch {
            return Response.json({ error: 'Invalid JSON' }, { status: 400 })
          }
          const signature =
            body && typeof body === 'object' && 'signature' in body ? body.signature : undefined
          const owner =
            typeof signature === 'string' &&
            configuration.owners.find((owner) => verifySafeConfirmation(hash, owner, signature))
          if (
            !owner ||
            typeof signature !== 'string' ||
            verifySafeHash(proposal, options.chainId, safe, configuration.version).status !== 'matched'
          ) {
            return Response.json({ error: 'Invalid owner signature' }, { status: 400 })
          }
          const stored = confirmations.get(hash) ?? new Map<string, string>()
          if (!stored.has(owner)) {
            stored.set(owner, signature)
          }
          confirmations.set(hash, stored)
          if (!proposal.confirmations.includes(owner)) {
            proposal.confirmations.push(owner)
          }
          return Response.json({ signature }, { status: 201 })
        }
        if (request.method === 'GET') {
          const offset = Number(url.searchParams.get('offset') ?? 0)
          if (!Number.isSafeInteger(offset) || offset < 0) {
            return Response.json({ error: 'Invalid query' }, { status: 400 })
          }
          const entries = [...(confirmations.get(hash) ?? [])].map(([owner, signature]) => ({
            owner,
            signature
          }))
          const next = new URL(url)
          next.searchParams.set('offset', String(offset + pageSize))
          return Response.json({
            count: entries.length,
            next: offset + pageSize < entries.length ? next.href : null,
            previous: null,
            results: entries.slice(offset, offset + pageSize)
          })
        }
      }
      if (request.method !== 'GET') {
        return Response.json({ error: 'Method not allowed' }, { status: 405 })
      }
      if (url.pathname === `/api/v1/safes/${safe}/`) {
        return Response.json({ address: safe, ...configuration })
      }
      if (url.pathname !== `/api/v2/safes/${safe}/multisig-transactions/`) {
        return Response.json({ error: 'Safe not found' }, { status: 404 })
      }
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const minNonce = url.searchParams.get('nonce__gte') ?? '0'
      if (
        url.searchParams.get('executed') !== 'false' ||
        !/^\d+$/.test(minNonce) ||
        !Number.isSafeInteger(offset) ||
        offset < 0
      ) {
        return Response.json({ error: 'Invalid query' }, { status: 400 })
      }
      const pending = proposals.filter((proposal) => BigInt(proposal.nonce) >= BigInt(minNonce))
      const results = pending.slice(offset, offset + pageSize).map((proposal) => ({
        ...proposal,
        isExecuted: false,
        confirmations: proposal.confirmations.map((owner) => ({ owner }))
      }))
      const next = new URL(url)
      next.searchParams.set('offset', String(offset + pageSize))
      return Response.json({
        count: pending.length,
        next: offset + pageSize < pending.length ? next.href : null,
        previous: null,
        results
      })
    }
  }
  return Object.assign(controls.fetch, controls)
}
