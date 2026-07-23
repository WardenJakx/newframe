import { expect, test } from 'bun:test'

import { Interface, parseUnits } from 'ethers'
import { FLASH_ANVIL_CHAIN_ID, FLASH_USDC_ADDRESS } from '../../resources/domain/flash/constants'

const NEWFRAME_RPC_URL = 'http://127.0.0.1:1248'
const CHAIN_ID = `0x${FLASH_ANVIL_CHAIN_ID.toString(16)}`
const RECIPIENT = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
const TRANSFER_AMOUNT = parseUnits('10', 6)
const RECEIPT_TIMEOUT_MS = 30_000

const usdcInterface = new Interface([
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)'
])

type AgentCredentials = {
  sessionId: string
  sessionToken: string
  account: string
}

type JsonRpcResponse<T> = {
  result?: T
  error?: {
    message?: string
  }
}

type TransactionReceipt = {
  status: string
}

async function responseJson<T>(response: Response) {
  const body = (await response.json()) as T
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error?: unknown }).error)
        : `HTTP ${response.status}`
    throw new Error(message)
  }
  return body
}

async function requestAgentSession() {
  console.log('Approve the "USDC Transfer E2E" agent session in Newframe to continue.')

  const response = await fetch(`${NEWFRAME_RPC_URL}/agent/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      descriptor: {
        name: 'USDC Transfer E2E',
        description: 'Sends 10 USDC to the requested recipient on the Newframe Anvil network.'
      },
      durationSeconds: 600
    })
  })

  return responseJson<AgentCredentials & { error?: string }>(response)
}

async function revokeAgentSession(credentials: AgentCredentials) {
  const response = await fetch(`${NEWFRAME_RPC_URL}/agent/session/${credentials.sessionId}`, {
    method: 'DELETE',
    headers: {
      authorization: `Bearer ${credentials.sessionToken}`,
      'x-newframe-agent-session': credentials.sessionId
    }
  })

  if (response.status !== 204) {
    throw new Error(`Agent session revocation failed with HTTP ${response.status}`)
  }
}

async function newframeRpc<T>(method: string, params: unknown[]) {
  const response = await fetch(`${NEWFRAME_RPC_URL}?chainId=${FLASH_ANVIL_CHAIN_ID}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'agent-usdc.e2e'
    },
    body: JSON.stringify({
      id: method,
      jsonrpc: '2.0',
      method,
      params,
      chainId: CHAIN_ID
    })
  })
  const body = await responseJson<JsonRpcResponse<T>>(response)

  if (body.error) throw new Error(body.error.message || `${method} failed`)
  if (body.result === undefined) throw new Error(`${method} returned no result`)
  return body.result
}

async function agentRpc<T>(credentials: AgentCredentials, method: string, params: unknown[]) {
  const response = await fetch(`${NEWFRAME_RPC_URL}/agent/rpc`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${credentials.sessionToken}`,
      'content-type': 'application/json',
      'x-newframe-agent-session': credentials.sessionId
    },
    body: JSON.stringify({
      id: method,
      jsonrpc: '2.0',
      method,
      params,
      chainId: CHAIN_ID
    })
  })
  const body = await responseJson<JsonRpcResponse<T>>(response)

  if (body.error) throw new Error(body.error.message || `${method} failed`)
  if (body.result === undefined) throw new Error(`${method} returned no result`)
  return body.result
}

async function usdcBalance(address: string) {
  const data = usdcInterface.encodeFunctionData('balanceOf', [address])
  const result = await newframeRpc<string>('eth_call', [{ to: FLASH_USDC_ADDRESS, data }, 'latest'])
  const [balance] = usdcInterface.decodeFunctionResult('balanceOf', result)

  return BigInt(balance)
}

async function waitForReceipt(transactionHash: string) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < RECEIPT_TIMEOUT_MS) {
    const receipt = await newframeRpc<TransactionReceipt | null>('eth_getTransactionReceipt', [
      transactionHash
    ])
    if (receipt) return receipt
    await Bun.sleep(250)
  }

  throw new Error(`Timed out waiting for transaction receipt: ${transactionHash}`)
}

test('creates an agent session and sends 10 USDC on Newframe Anvil', async () => {
  const balanceBefore = await usdcBalance(RECIPIENT)
  const credentials = await requestAgentSession()

  try {
    const data = usdcInterface.encodeFunctionData('transfer', [RECIPIENT, TRANSFER_AMOUNT])
    const transactionHash = await agentRpc<string>(credentials, 'eth_sendTransaction', [
      {
        from: credentials.account,
        to: FLASH_USDC_ADDRESS,
        data,
        value: '0x0',
        chainId: CHAIN_ID
      }
    ])
    const receipt = await waitForReceipt(transactionHash)
    const balanceAfter = await usdcBalance(RECIPIENT)

    expect(transactionHash).toMatch(/^0x[0-9a-fA-F]{64}$/)
    expect(receipt.status).toBe('0x1')
    expect(balanceAfter - balanceBefore).toBe(TRANSFER_AMOUNT)

    console.log(
      JSON.stringify({
        transactionHash,
        from: credentials.account,
        to: RECIPIENT,
        token: FLASH_USDC_ADDRESS,
        amount: '10 USDC',
        chainId: FLASH_ANVIL_CHAIN_ID
      })
    )
  } finally {
    await revokeAgentSession(credentials)
  }
}, 150_000)
