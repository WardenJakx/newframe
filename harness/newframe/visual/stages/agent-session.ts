import { verifyMessage, verifyTypedData } from 'ethers'

import {
  FLASH_USDC_ADDRESS,
  FLASH_WETH_ADDRESS
} from '../../../../apps/newframe/resources/domain/flash/constants.ts'
import { anvilChainId, localTradeServiceUrl, newframeRpcUrl } from '../../core/config.ts'
import type { VisualStage } from '../types.ts'
import { requireAccounts } from './helpers.ts'

const recipient = '0x000000000000000000000000000000000000a11c'

type AgentCredentials = {
  sessionId: string
  sessionToken: string
  account: string
  expiresAt: number
}

async function connectAgent() {
  const response = await fetch(`${newframeRpcUrl}/agent/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      descriptor: {
        name: 'Visual Harness Agent',
        description: 'Exercises Newframe autonomous signing on the local Anvil network.'
      },
      durationSeconds: 600
    })
  })
  const body = (await response.json()) as AgentCredentials & { error?: string }
  if (!response.ok) throw new Error(body.error || `Agent connection failed with ${response.status}`)
  return body
}

async function agentRpc(credentials: AgentCredentials, payload: Record<string, unknown>) {
  const response = await fetch(`${newframeRpcUrl}/agent/rpc`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${credentials.sessionToken}`,
      'content-type': 'application/json',
      'x-newframe-agent-session': credentials.sessionId
    },
    body: JSON.stringify(payload)
  })
  const body = (await response.json()) as {
    result?: string
    error?: { message?: string }
  }
  if (!response.ok || body.error || !body.result) {
    throw new Error(body.error?.message || `Agent request failed with ${response.status}`)
  }
  return body.result
}

async function autonomousSend(credentials: AgentCredentials) {
  return agentRpc(credentials, {
    id: 'visual-agent-send',
    jsonrpc: '2.0',
    method: 'eth_sendTransaction',
    chainId: `0x${anvilChainId.toString(16)}`,
    params: [
      {
        chainId: `0x${anvilChainId.toString(16)}`,
        to: recipient,
        value: '0x1'
      }
    ]
  })
}

async function autonomousPersonalSign(credentials: AgentCredentials, message: string) {
  return agentRpc(credentials, {
    id: 'visual-agent-personal-sign',
    jsonrpc: '2.0',
    method: 'personal_sign',
    params: [message, credentials.account]
  })
}

async function revokeSession(credentials: AgentCredentials) {
  const response = await fetch(`${newframeRpcUrl}/agent/session/${credentials.sessionId}`, {
    method: 'DELETE',
    headers: {
      authorization: `Bearer ${credentials.sessionToken}`,
      'x-newframe-agent-session': credentials.sessionId
    }
  })
  if (response.status !== 204) throw new Error(`Agent session revocation failed with ${response.status}`)
}

async function flashRequest(path: string, init: RequestInit) {
  const response = await fetch(`${localTradeServiceUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) }
  })
  const body = (await response.json()) as Record<string, any>
  if (!response.ok) throw new Error(body.message || `Local Flash request failed with ${response.status}`)
  return body
}

async function submitExternalFlashOrder(credentials: AgentCredentials) {
  const quoteRequest = {
    contraAsset: FLASH_USDC_ADDRESS,
    contraChain: 'anvil',
    funderAddress: credentials.account,
    limitNotionalPrice: '2500',
    maxPriceImpact: '0.05',
    maxSlippage: '0.005',
    orderType: 'limit',
    qty: '0.01',
    side: 'sell',
    targetAsset: FLASH_WETH_ADDRESS,
    targetChain: 'anvil'
  }
  const quote = await flashRequest('/v1/quote', {
    method: 'POST',
    body: JSON.stringify(quoteRequest)
  })
  const evmOrderTypedData = String(quote.evm?.orderTypedData || '')
  if (!evmOrderTypedData) throw new Error('Local Flash quote omitted its order typed data')

  const userSignature = await agentRpc(credentials, {
    id: 'visual-agent-flash-order-sign',
    jsonrpc: '2.0',
    method: 'eth_signTypedData_v4',
    params: [credentials.account, JSON.parse(evmOrderTypedData)]
  })
  const submitted = await flashRequest('/v1/order', {
    method: 'POST',
    body: JSON.stringify({
      ...quoteRequest,
      contraAsset: quote.contraAsset,
      targetAsset: quote.targetAsset,
      quoteId: quote.quoteId,
      userSignature,
      evmOrderTypedData
    })
  })
  const orderId = String(submitted.orderId || '')
  if (!orderId) throw new Error('Local Flash submit omitted its order id')
  return orderId
}

async function cancelExternalFlashOrder(credentials: AgentCredentials, orderId: string) {
  const cancelMessage = `Definitive Flash v1 — Cancel Order\nOrder: ${orderId}`
  const userSignature = await autonomousPersonalSign(credentials, cancelMessage)
  await flashRequest(`/v1/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ cancelMessage, userSignature })
  })
}

export const agentSessionStage: VisualStage = {
  name: 'agent session and autonomous actions',
  async run(context) {
    const { anvil, driver, runtime, tray } = context
    const { harness } = await requireAccounts(context)
    await driver.clearPanelAndOverlays()
    await driver.setSelectedAccount(harness)
    await driver.executeCommand(tray, {
      type: 'account.agent-access-set',
      accountId: harness.id,
      enabled: true
    })

    await tray.getByRole('button', { name: 'Accounts' }).click()
    const accountsDialog = tray.getByRole('dialog', { name: 'Accounts' })
    await accountsDialog.getByText('AI Wallet', { exact: true }).waitFor({ state: 'visible' })
    await runtime.screenshot(tray, '08b-ai-wallet-tag.png')
    await accountsDialog.getByRole('button', { name: 'Close accounts' }).click()

    const connection = connectAgent()
    const request = await driver.waitForCurrentRequest('agentAccess', new Set(), 15_000)
    await tray.getByText('Visual Harness Agent', { exact: true }).waitFor({ state: 'visible' })
    await runtime.screenshot(tray, '08c-agent-session-request.png')
    await driver.executeCommand(tray, {
      type: 'request.agent-access-resolve',
      requestId: request.handlerId,
      approved: true
    })
    const credentials = await connection

    if (credentials.account.toLowerCase() !== harness.address.toLowerCase()) {
      runtime.fail('Agent session was not scoped to the approved harness wallet')
    }

    const personalMessage = 'Newframe visual harness autonomous agent'
    const personalSignature = await autonomousPersonalSign(credentials, personalMessage)
    const recoveredPersonalAddress = verifyMessage(personalMessage, personalSignature).toLowerCase()
    if (recoveredPersonalAddress !== credentials.account.toLowerCase()) {
      runtime.fail('Agent personal_sign signature did not recover to its authorized wallet')
    }

    const domain = {
      name: 'Newframe Visual Harness',
      version: '1',
      chainId: anvilChainId
    }
    const actionTypes = [
      { name: 'action', type: 'string' },
      { name: 'sessionId', type: 'string' }
    ]
    const typedMessage = {
      action: 'autonomous-signature-test',
      sessionId: credentials.sessionId
    }
    const typedSignature = await agentRpc(credentials, {
      id: 'visual-agent-typed-sign',
      jsonrpc: '2.0',
      method: 'eth_signTypedData_v4',
      params: [
        credentials.account,
        {
          domain,
          primaryType: 'AgentAction',
          types: {
            EIP712Domain: [
              { name: 'name', type: 'string' },
              { name: 'version', type: 'string' },
              { name: 'chainId', type: 'uint256' }
            ],
            AgentAction: actionTypes
          },
          message: typedMessage
        }
      ]
    })
    const recoveredTypedAddress = verifyTypedData(
      domain,
      { AgentAction: actionTypes },
      typedMessage,
      typedSignature
    ).toLowerCase()
    if (recoveredTypedAddress !== credentials.account.toLowerCase()) {
      runtime.fail('Agent typed-data signature did not recover to its authorized wallet')
    }

    const balanceBefore = await anvil.balance(recipient)
    const selectedBefore = String((await driver.getAppState()).main?.currentAccount || '').toLowerCase()
    const transactionHash = await autonomousSend(credentials)
    await anvil.waitForBalance(recipient, balanceBefore + 1n)
    const stateAfter = await driver.getAppState()
    const selectedAfter = String(stateAfter.main?.currentAccount || '').toLowerCase()

    if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) {
      runtime.fail(`Agent send returned an invalid transaction hash: ${transactionHash}`)
    }
    if (selectedAfter !== selectedBefore) {
      runtime.fail('Autonomous agent send changed the wallet selected in the UI')
    }
    const promptedAutonomousAction = Object.values(stateAfter.main?.accounts || {}).some((account) =>
      Object.values(account.requests || {}).some((candidate) =>
        ['sign', 'signTypedData', 'transaction'].includes(candidate.type)
      )
    )
    if (promptedAutonomousAction) runtime.fail('Autonomous agent action created a signing prompt')

    const externalOrderId = await submitExternalFlashOrder(credentials)
    await driver.waitForFlashOrder(
      (order) => order.orderId === externalOrderId && order.status === 'accepted' && order.open === true,
      15_000,
      'The agent-created Flash order was not discovered through the WebSocket'
    )
    await cancelExternalFlashOrder(credentials, externalOrderId)
    await driver.waitForFlashOrder(
      (order) => order.orderId === externalOrderId && order.status === 'cancelled' && order.open === false,
      15_000,
      'The external Flash cancellation was not applied through the WebSocket'
    )
    await driver.assertFlashOrderVisible(externalOrderId)
    await runtime.screenshot(tray, '08d-agent-external-flash-order.png')

    await revokeSession(credentials)
    const rejectedAfterRevocation = await fetch(`${newframeRpcUrl}/agent/rpc`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${credentials.sessionToken}`,
        'content-type': 'application/json',
        'x-newframe-agent-session': credentials.sessionId
      },
      body: JSON.stringify({
        id: 'revoked-agent-send',
        jsonrpc: '2.0',
        method: 'eth_sendTransaction',
        chainId: `0x${anvilChainId.toString(16)}`,
        params: [{ to: recipient, value: '0x1' }]
      })
    })
    if (rejectedAfterRevocation.status !== 401) {
      runtime.fail('Revoked agent session remained authorized')
    }

    await driver.clearPanelAndOverlays()
    await tray.getByRole('tab', { name: 'Activity' }).click()
    await runtime.screenshot(tray, '08e-agent-autonomous-actions.png')
  }
}
