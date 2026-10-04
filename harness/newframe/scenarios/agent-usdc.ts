import { createDesktopClient } from '@newframe/desktop-api/client'
import type { AgentCredentials } from '@newframe/desktop-api/schemas'
import { FLASH_ANVIL_CHAIN_ID, FLASH_USDC_ADDRESS } from '@newframe/flash/constants'
import { Interface, parseUnits } from 'ethers'

const NEWFRAME_RPC_URL = 'http://127.0.0.1:1248'
const CHAIN_ID = `0x${FLASH_ANVIL_CHAIN_ID.toString(16)}`
const RECIPIENT = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
const TRANSFER_AMOUNT = parseUnits('10', 6)
const RECEIPT_TIMEOUT_MS = 30_000

const usdcInterface = new Interface([
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)'
])

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

const desktop = createDesktopClient(NEWFRAME_RPC_URL)
const agentClient = (credentials: AgentCredentials) =>
  createDesktopClient(NEWFRAME_RPC_URL, {
    headers: () => ({
      authorization: `Bearer ${credentials.sessionToken}`,
      'x-newframe-agent-session': credentials.sessionId
    })
  })

async function requestAgentSession() {
  console.log('Approve the "USDC Transfer E2E" agent session in Newframe to continue.')
  return createDesktopClient(NEWFRAME_RPC_URL).agent.connect.mutate({
    descriptor: {
      name: 'USDC Transfer E2E',
      description: 'Sends 10 USDC to the requested recipient on the Newframe Anvil chain.'
    },
    durationSeconds: 600
  })
}

function newframeRpc(method: string, params: unknown[]) {
  return desktop.rpc.mutate({ method, params, chainId: CHAIN_ID })
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
    const transactionHash = await agentClient(credentials).wallet.sendTransaction.mutate({
      transaction: {
        from: credentials.account,
        to: FLASH_USDC_ADDRESS,
        data,
        value: '0x0',
        chainId: CHAIN_ID
      },
      chainId: CHAIN_ID
    })
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
    await agentClient(credentials).agent.revoke.mutate({ sessionId: credentials.sessionId })
  }
}

await main()
