import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  Contract,
  FetchRequest,
  Interface,
  JsonRpcProvider,
  type InterfaceAbi,
  type TransactionResponse
} from 'ethers'

import { anvilChainId, contractsDir, newframeRpcUrl } from '../../core/config.ts'
import { TaskService } from '../../core/task-service.ts'
import type { VisualStage } from '../types.ts'
import { requireAccounts } from './helpers.ts'

type ContractArtifact = {
  abi?: InterfaceAbi
}

const harnessOriginUrl = process.env.NEWFRAME_ORIGIN || 'http://newframe-contracts.local'
const harnessAccountAddress = process.env.HARNESS_ACCOUNT || '0x35f9179059a691d8beecf82fe112f7277e018588'
const usdcAddress = process.env.USDC_ADDRESS || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const testContractAddress = process.env.TEST_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000001337'
const usdcFlowMemo = process.env.USDC_FLOW_MEMO || 'Newframe USDC integration flow'

function usdcFlowAmount() {
  const value = process.env.USDC_FLOW_AMOUNT
  if (!value) return 25_000_000n

  try {
    return BigInt(value)
  } catch {
    throw new Error(`Invalid USDC_FLOW_AMOUNT: ${value}`)
  }
}

async function artifactInterface(relativePath: string) {
  const artifactPath = path.join(contractsDir, 'out', relativePath)
  const artifact = JSON.parse(await readFile(artifactPath, 'utf8')) as ContractArtifact

  if (!artifact.abi) throw new Error(`Artifact has no ABI: ${artifactPath}`)
  return new Interface(artifact.abi)
}

async function waitForTransaction(transaction: Promise<TransactionResponse>, label: string) {
  const response = await transaction
  const receipt = await response.wait(1)

  if (!receipt || receipt.status !== 1) throw new Error(`${label} transaction failed: ${response.hash}`)
}

async function runUsdcIntegration(signal: AbortSignal) {
  if (signal.aborted) throw new Error('USDC integration was cancelled')

  const [usdcInterface, testContractInterface] = await Promise.all([
    artifactInterface('MockUSDC.sol/MockUSDC.json'),
    artifactInterface('TestContract.sol/TestContract.json')
  ])
  const request = new FetchRequest(`${newframeRpcUrl}?chainId=${anvilChainId}`)
  request.setHeader('Origin', harnessOriginUrl)
  const provider = new JsonRpcProvider(request, anvilChainId, {
    batchMaxCount: 1,
    pollingInterval: 250,
    staticNetwork: true
  })
  const stop = () => provider.destroy()
  signal.addEventListener('abort', stop, { once: true })

  try {
    const signer = await provider.getSigner(harnessAccountAddress)
    const usdc = new Contract(usdcAddress, usdcInterface, signer)
    const testContract = new Contract(testContractAddress, testContractInterface, signer)

    await waitForTransaction(usdc.approve(testContractAddress, usdcFlowAmount()), 'USDC approval')
    await waitForTransaction(
      testContract.depositToken(usdcAddress, usdcFlowAmount(), usdcFlowMemo),
      'USDC deposit'
    )
  } finally {
    signal.removeEventListener('abort', stop)
    provider.destroy()
  }
}

function createUsdcIntegrationService() {
  return new TaskService('USDC integration', runUsdcIntegration)
}

export const usdcIntegrationStage: VisualStage = {
  name: 'usdc integration',
  async run(context) {
    const { anvil, driver, runtime, services, tray } = context
    const { harness } = await requireAccounts(context)
    await driver.waitForState(
      (state) => String(state.selected?.current || '').toLowerCase() === harness.id,
      5_000,
      'Harness account was not selected before USDC integration'
    )

    const integration = await services.start(createUsdcIntegrationService())
    const stopMining = anvil.startBackgroundMining(100)

    try {
      const firstRequest = await driver.waitForCurrentRequest('transaction', new Set(), 60_000)
      await runtime.screenshot(tray, '16-usdc-approve-review.png')
      await driver.signCurrentTransaction(firstRequest, '17-usdc-approve-submitted.png', [
        '16a-usdc-approve-warning.png',
        '16b-usdc-approve-post-sign-warning.png'
      ])

      const secondRequest = await driver.waitForCurrentRequest(
        'transaction',
        new Set([firstRequest.handlerId]),
        90_000
      )
      await runtime.screenshot(tray, '18-usdc-deposit-review.png')
      await driver.signCurrentTransaction(secondRequest, '19-usdc-complete.png', [
        '18a-usdc-deposit-warning.png',
        '18b-usdc-deposit-post-sign-warning.png'
      ])
    } finally {
      await stopMining()
    }

    await services.watch(integration.completed)
  }
}
