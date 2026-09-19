import { Interface, parseUnits } from 'ethers'

import {
  FLASH_ANVIL_CHAIN_ID,
  FLASH_USDC_ADDRESS
} from '../../../apps/newframe/src/features/transactions/trade/domain/constants.ts'

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

type TransactionReceipt = {
  status: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string') {
    throw new Error(`${label} returned a non-string value`)
  }
  return value
}

async function responseJson(response: Response): Promise<unknown> {
  const body: unknown = await response.json()
  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === 'string' ? body.error : `HTTP ${response.status}`
    throw new Error(message)
  }
  return body
}

function rpcResult(body: unknown, method: string) {
  if (!isRecord(body)) {
    throw new Error(`${method} returned an invalid JSON-RPC response`)
  }
  if (isRecord(body.error)) {
    throw new Error(typeof body.error.message === 'string' ? body.error.message : `${method} failed`)
  }
  if (!('result' in body)) {
    throw new Error(`${method} returned no result`)
  }
  return body.result
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

  const body = await responseJson(response)
  if (
    !isRecord(body) ||
    typeof body.sessionId !== 'string' ||
    typeof body.sessionToken !== 'string' ||
    typeof body.account !== 'string'
  ) {
    throw new Error('Agent session returned invalid credentials')
  }
  return {
    sessionId: body.sessionId,
    sessionToken: body.sessionToken,
    account: body.account
  }
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

async function newframeRpc(method: string, params: unknown[]) {
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
  return rpcResult(await responseJson(response), method)
}

async function agentRpc(credentials: AgentCredentials, method: string, params: unknown[]) {
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
  return rpcResult(await responseJson(response), method)
}

async function usdcBalance(address: string) {
  const data = usdcInterface.encodeFunctionData('balanceOf', [address])
  const result = requireString(
    await newframeRpc('eth_call', [{ to: FLASH_USDC_ADDRESS, data }, 'latest']),
    'eth_call'
  )
  const [balance] = usdcInterface.decodeFunctionResult('balanceOf', result)

  if (typeof balance !== 'bigint') {
    throw new Error('balanceOf returned a non-bigint balance')
  }
  return balance
}

async function waitForReceipt(transactionHash: string) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < RECEIPT_TIMEOUT_MS) {
    const receipt = await newframeRpc('eth_getTransactionReceipt', [transactionHash])
    if (receipt !== null) {
      if (!isRecord(receipt) || typeof receipt.status !== 'string') {
        throw new Error('eth_getTransactionReceipt returned an invalid receipt')
      }
      return { status: receipt.status } satisfies TransactionReceipt
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for transaction receipt: ${transactionHash}`)
}

async function main() {
  const balanceBefore = await usdcBalance(RECIPIENT)
  const credentials = await requestAgentSession()

  try {
    const data = usdcInterface.encodeFunctionData('transfer', [RECIPIENT, TRANSFER_AMOUNT])
    const transactionHash = requireString(
      await agentRpc(credentials, 'eth_sendTransaction', [
        {
          from: credentials.account,
          to: FLASH_USDC_ADDRESS,
          data,
          value: '0x0',
          chainId: CHAIN_ID
        }
      ]),
      'eth_sendTransaction'
    )
    const receipt = await waitForReceipt(transactionHash)
    const balanceAfter = await usdcBalance(RECIPIENT)

    if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) {
      throw new Error(`Invalid transaction hash: ${transactionHash}`)
    }
    if (receipt.status !== '0x1') {
      throw new Error(`Transaction reverted: ${transactionHash}`)
    }
    if (balanceAfter - balanceBefore !== TRANSFER_AMOUNT) {
      throw new Error(
        `Recipient balance changed by ${balanceAfter - balanceBefore}; expected ${TRANSFER_AMOUNT}`
      )
    }

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
}

await main()
