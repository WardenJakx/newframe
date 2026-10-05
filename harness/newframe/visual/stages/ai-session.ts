import { chmod, copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { FLASH_USDC_ADDRESS, FLASH_WETH_ADDRESS } from '@newframe/flash/constants'
import { verifyMessage, verifyTypedData } from 'ethers'

import { anvilChainId, localTradeServiceUrl, newframeRpcUrl, rootDir } from '../../core/config.ts'
import { spawnProcessGroup } from '../../core/reaper.ts'
import type { VisualHarnessContext, VisualStage } from '../types.ts'
import { requireAccounts } from './helpers.ts'

const recipient = '0x000000000000000000000000000000000000a11c'

type AiSessionCredentials = {
  sessionId: string
  account: string
  expiresAt: number
}

const cliPath = path.join(rootDir, 'apps/newframe-cli/src/index.ts')

type CliContext = { stateDir: string }

async function runCli(context: CliContext, args: string[]) {
  const result = await runCliResult(context, args)
  if (result.code !== 0) {
    throw new Error(`Newframe CLI ${args.join(' ')} failed: ${result.stderr || result.stdout}`)
  }
  try {
    return JSON.parse(result.stdout) as Record<string, unknown>
  } catch {
    throw new Error(`Newframe CLI returned non-JSON output: ${result.stdout}`)
  }
}

async function runCliResult(context: CliContext, args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawnProcessGroup('bun', [cliPath, ...args], {
      cwd: rootDir,
      env: {
        ...process.env,
        NEWFRAME_RPC_URL: newframeRpcUrl,
        NEWFRAME_FLASH_URL: `${localTradeServiceUrl}/v1`,
        NEWFRAME_CLI_STATE_DIR: context.stateDir
      }
    })
    let stdout = ''
    let stderr = ''
    child.stdout!.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr!.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() }))
  })
}

async function connectAiSession(context: CliContext) {
  return runCli(context, [
    'session',
    'start',
    '--name',
    'Visual Harness Agent',
    '--duration',
    '600'
  ]) as Promise<AiSessionCredentials>
}

async function aiSessionRpc(context: CliContext, method: string, params: unknown, chainId?: number) {
  const response = await runCli(context, [
    'rpc',
    method,
    '--params',
    JSON.stringify(params),
    ...(chainId ? ['--chain-id', String(chainId)] : [])
  ])
  if (typeof response.result !== 'string') {
    throw new Error(`CLI ${method} omitted its result`)
  }
  return response.result
}

async function autonomousSend(context: CliContext) {
  return aiSessionRpc(
    context,
    'eth_sendTransaction',
    [
      {
        chainId: `0x${anvilChainId.toString(16)}`,
        to: recipient,
        value: '0x1'
      }
    ],
    anvilChainId
  )
}

async function autonomousPersonalSign(context: CliContext, account: string, message: string) {
  return aiSessionRpc(context, 'personal_sign', [message, account])
}

// The selected UI wallet differs from the session wallet, so the response proves session scoping.
async function assertAiSessionAssets(context: VisualHarnessContext, cliContext: CliContext, account: string) {
  const { anvil, driver } = context
  const { harness, vitalik } = await requireAccounts(context)
  await driver.refreshBalances()
  await driver.setSelectedAccount(vitalik)
  try {
    const response = await runCli(cliContext, ['rpc', 'wallet_getAssets'])
    const assets = response.result as { nativeCurrency?: { chainId: number; balance: string }[] } | undefined
    const native = assets?.nativeCurrency?.find((balance) => Number(balance.chainId) === anvilChainId)
    if (!native) {
      context.runtime.fail('CLI wallet_getAssets omitted the session wallet Anvil ETH balance')
    }
    const expected = await anvil.balance(account)
    if (BigInt(native.balance) !== expected) {
      context.runtime.fail(
        `CLI wallet_getAssets returned ${native.balance}, expected session wallet balance ${expected}`
      )
    }
    context.runtime.evidence('aiSessionAssetsNativeBalance', native.balance)
  } finally {
    await driver.setSelectedAccount(harness)
  }
}

async function revokeSession(context: CliContext) {
  await runCli(context, ['session', 'revoke'])
}

async function submitExternalFlashOrder(context: CliContext) {
  const wethAddress = FLASH_WETH_ADDRESS.toLowerCase()
  const usdcAddress = FLASH_USDC_ADDRESS.toLowerCase()
  const quoteRequest = {
    contraAsset: {
      id: `${anvilChainId}:${usdcAddress}`,
      address: usdcAddress,
      chainId: anvilChainId,
      decimals: 6,
      isNative: false,
      name: 'USD Coin',
      symbol: 'USDC'
    },
    limitNotionalPrice: '2500',
    maxPriceImpact: '0.05',
    slippage: '0.005',
    orderType: 'limit',
    qty: '0.01',
    side: 'sell',
    targetAsset: {
      id: `${anvilChainId}:${wethAddress}`,
      address: wethAddress,
      chainId: anvilChainId,
      decimals: 18,
      isNative: false,
      name: 'Wrapped Ether',
      symbol: 'WETH'
    }
  }
  const requestPath = path.join(context.stateDir, 'flash-request.json')
  const quotePath = path.join(context.stateDir, 'flash-quote.json')
  await writeFile(requestPath, JSON.stringify(quoteRequest))
  await runCli(context, ['flash', 'quote', '--request', requestPath, '--out', quotePath])
  const submitted = await runCli(context, ['flash', 'submit', '--quote', quotePath])
  const orderId = typeof submitted.orderId === 'string' ? submitted.orderId : ''
  if (!orderId) {
    throw new Error('Local Flash submit omitted its order id')
  }
  return orderId
}

async function cancelExternalFlashOrder(context: CliContext, orderId: string) {
  await runCli(context, ['flash', 'cancel', orderId])
}

export const aiSessionStage: VisualStage = {
  name: 'AI session and autonomous actions',
  async run(context) {
    const { anvil, driver, runtime, tray } = context
    const { harness } = await requireAccounts(context)
    const backToActivity = tray.getByRole('button', { name: 'Back to activity' })
    if (await backToActivity.isVisible()) {
      await backToActivity.click()
    }
    await driver.clearPanelAndOverlays()
    await driver.setSelectedAccount(harness)
    await driver.setAiSessionsEnabled(harness, true)

    await tray.getByRole('button', { name: 'Accounts' }).click()
    const accountsDialog = tray.getByRole('dialog', { name: 'Accounts' })
    const harnessAddress = `${harness.address.slice(0, 8)}...${harness.address.slice(-6)}`
    await accountsDialog
      .getByRole('button', { name: new RegExp(harnessAddress.replaceAll('.', '\\.'), 'i') })
      .getByText('· AI Wallet', { exact: true })
      .waitFor({ state: 'visible' })
    await runtime.screenshot(tray, '08b-ai-wallet-tag.png')
    await accountsDialog.getByRole('button', { name: 'Close accounts' }).click()

    const cliContext: CliContext = { stateDir: await mkdtemp(path.join(tmpdir(), 'newframe-visual-cli-')) }
    let revokedContext: CliContext | undefined
    try {
      const connection = connectAiSession(cliContext)
      const request = await driver.waitForCurrentRequest('aiSession', new Set(), 15_000)
      await tray.getByText('Visual Harness Agent', { exact: true }).waitFor({ state: 'visible' })
      await runtime.screenshot(tray, '08c-ai-session-request.png')
      await driver.executeCommand(tray, {
        type: 'request.ai-session-resolve',
        requestId: request.requestId,
        approved: true
      })
      const credentials = await connection

      if (credentials.account.toLowerCase() !== harness.address.toLowerCase()) {
        runtime.fail('AI session was not scoped to the approved harness wallet')
      }
      const stateBeforeActions = await driver.getAppState()
      const existingRequestIds = new Set(
        Object.entries(stateBeforeActions.main?.accounts ?? {}).flatMap(([accountId, account]) =>
          Object.keys(account.requests ?? {}).map((requestId) => `${accountId}:${requestId}`)
        )
      )

      await assertAiSessionAssets(context, cliContext, credentials.account)

      const personalMessage = 'Newframe visual harness autonomous agent'
      const personalSignature = await autonomousPersonalSign(cliContext, credentials.account, personalMessage)
      const recoveredPersonalAddress = verifyMessage(personalMessage, personalSignature).toLowerCase()
      if (recoveredPersonalAddress !== credentials.account.toLowerCase()) {
        runtime.fail('AI session personal_sign signature did not recover to its authorized wallet')
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
      const typedSignature = await aiSessionRpc(cliContext, 'eth_signTypedData_v4', [
        credentials.account,
        {
          domain,
          primaryType: 'AiSessionAction',
          types: {
            EIP712Domain: [
              { name: 'name', type: 'string' },
              { name: 'version', type: 'string' },
              { name: 'chainId', type: 'uint256' }
            ],
            AiSessionAction: actionTypes
          },
          message: typedMessage
        }
      ])
      const recoveredTypedAddress = verifyTypedData(
        domain,
        { AiSessionAction: actionTypes },
        typedMessage,
        typedSignature
      ).toLowerCase()
      if (recoveredTypedAddress !== credentials.account.toLowerCase()) {
        runtime.fail('AI session typed-data signature did not recover to its authorized wallet')
      }

      const balanceBefore = await anvil.balance(recipient)
      const selectedBefore = String((await driver.getAppState()).main?.currentAccount ?? '').toLowerCase()
      const transactionHash = await autonomousSend(cliContext)
      await anvil.waitForBalance(recipient, balanceBefore + 1n)
      const stateAfter = await driver.getAppState()
      const selectedAfter = String(stateAfter.main?.currentAccount ?? '').toLowerCase()

      if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) {
        runtime.fail(`AI session send returned an invalid transaction hash: ${transactionHash}`)
      }
      runtime.evidence('aiSessionId', credentials.sessionId)
      runtime.evidence('aiSessionTransactionHash', transactionHash)
      if (selectedAfter !== selectedBefore) {
        runtime.fail('Autonomous AI session send changed the wallet selected in the UI')
      }
      const promptedAutonomousAction = Object.entries(stateAfter.main?.accounts ?? {}).some(
        ([accountId, account]) =>
          Object.entries(account.requests ?? {}).some(
            ([requestId, candidate]) =>
              !existingRequestIds.has(`${accountId}:${requestId}`) &&
              (candidate.type === 'sign' ||
                candidate.type === 'signTypedData' ||
                candidate.type === 'transaction')
          )
      )
      if (promptedAutonomousAction) {
        runtime.fail('Autonomous AI session action created a signing prompt')
      }

      const externalOrderId = await submitExternalFlashOrder(cliContext)
      const orderList = await runCli(cliContext, ['flash', 'orders'])
      const listedOrders: unknown[] = Array.isArray(orderList.orders) ? orderList.orders : []
      if (
        !listedOrders.some(
          (order) =>
            order && typeof order === 'object' && 'orderId' in order && order.orderId === externalOrderId
        )
      ) {
        runtime.fail('CLI Flash order list did not include the submitted order')
      }
      const orderLookup = await runCli(cliContext, ['flash', 'order', externalOrderId])
      const lookedUpOrder =
        orderLookup.order && typeof orderLookup.order === 'object' ? orderLookup.order : orderLookup
      if (!('orderId' in lookedUpOrder) || lookedUpOrder.orderId !== externalOrderId) {
        runtime.fail('CLI Flash order lookup returned the wrong order')
      }
      await driver.waitForFlashOrder(
        (order) => order.orderId === externalOrderId && order.status === 'accepted' && order.open === true,
        15_000,
        'The AI-session-created Flash order was not discovered through the WebSocket'
      )
      await cancelExternalFlashOrder(cliContext, externalOrderId)
      await driver.waitForFlashOrder(
        (order) => order.orderId === externalOrderId && order.status === 'cancelled' && order.open === false,
        15_000,
        'The external Flash cancellation was not applied through the WebSocket'
      )
      const watchedOrder = await runCli(cliContext, ['flash', 'watch', externalOrderId])
      if (watchedOrder.orderId !== externalOrderId || watchedOrder.normalizedStatus !== 'cancelled') {
        runtime.fail('CLI Flash watch did not return the cancelled order')
      }
      await driver.assertFlashOrderVisible(externalOrderId)
      runtime.evidence('aiSessionFlashOrderId', externalOrderId)
      await runtime.screenshot(tray, '08d-ai-session-external-flash-order.png')

      revokedContext = { stateDir: await mkdtemp(path.join(tmpdir(), 'newframe-visual-revoked-')) }
      await copyFile(
        path.join(cliContext.stateDir, 'session.json'),
        path.join(revokedContext.stateDir, 'session.json')
      )
      await chmod(path.join(revokedContext.stateDir, 'session.json'), 0o600)
      await revokeSession(cliContext)
      const rejectedAfterRevocation = await runCliResult(revokedContext, [
        'rpc',
        'eth_sendTransaction',
        '--params',
        JSON.stringify([{ to: recipient, value: '0x1' }]),
        '--chain-id',
        String(anvilChainId)
      ])
      if (rejectedAfterRevocation.code === 0 || !rejectedAfterRevocation.stderr.includes('401:')) {
        runtime.fail('Revoked AI session credentials were not rejected with HTTP 401')
      }
      runtime.evidence('revokedSessionCliExitCode', rejectedAfterRevocation.code)

      await driver.clearPanelAndOverlays()
      await tray.getByRole('tab', { name: 'Activity' }).click()
      await runtime.screenshot(tray, '08e-ai-session-autonomous-actions.png')
    } finally {
      await rm(cliContext.stateDir, { recursive: true, force: true })
      if (revokedContext) {
        await rm(revokedContext.stateDir, { recursive: true, force: true })
      }
    }
  }
}
