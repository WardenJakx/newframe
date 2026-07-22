import { readFile } from 'node:fs/promises'
import path from 'node:path'

import {
  Contract,
  Interface,
  JsonRpcProvider,
  NonceManager,
  Wallet,
  WeiPerEther,
  toQuantity,
  type InterfaceAbi,
  type TransactionResponse
} from 'ethers'

import { anvilChainId, anvilRpcUrl, contractsDir } from '../core/config.ts'
import { expectSuccessfulExit, ProcessService } from '../core/process-service.ts'
import { TaskService } from '../core/task-service.ts'
import { waitForAnvil } from './anvil.ts'

type ContractArtifact = {
  abi?: InterfaceAbi
  deployedBytecode?: { object?: string }
}

const artifacts = {
  mockFlashSettlement: 'MockFlashSettlement.sol/MockFlashSettlement.json',
  testContract: 'TestContract.sol/TestContract.json',
  usdc: 'MockUSDC.sol/MockUSDC.json',
  weth: 'WETH9.sol/WETH9.json'
} as const

const harnessAccountAddress = process.env.HARNESS_ACCOUNT || '0x35f9179059a691d8beecf82fe112f7277e018588'
const usdcAddress = process.env.USDC_ADDRESS || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const wethAddress = process.env.WETH_ADDRESS || '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const mockFlashSettlementAddress =
  process.env.MOCK_FLASH_SETTLEMENT_ADDRESS || '0x0000000000000000000000000000000000005e77'
const testContractAddress = process.env.TEST_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000001337'
const multicall3Address = '0xcA11bde05977b3631167028862bE2a173976CA11'
const multicall3DeployerAddress = '0x05f32b3cc3888453ff71b01135b34ff8e41263f2'
const multicall3SignedTransactionPath = path.join(
  import.meta.dirname,
  '..',
  'resources',
  'multicall3-signed-transaction.txt'
)
const anvilDeployerPrivateKey =
  process.env.ANVIL_DEPLOYER_PRIVATE_KEY ||
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

function bigintEnv(key: string, fallback: bigint) {
  const value = process.env[key]
  if (!value) return fallback

  try {
    return BigInt(value)
  } catch {
    throw new Error(`Invalid ${key}: ${value}`)
  }
}

const harnessEthBalance = bigintEnv('HARNESS_ETH_BALANCE_HEX', 100n * WeiPerEther)
const harnessUsdcBalance = bigintEnv('HARNESS_USDC_BALANCE', 1_000_000n * 1_000_000n)
const harnessWethBalance = bigintEnv('HARNESS_WETH_BALANCE', 10n * WeiPerEther)
const settlementUsdcLiquidity = bigintEnv('MOCK_FLASH_SETTLEMENT_USDC_LIQUIDITY', 1_000_000n * 1_000_000n)
const settlementWethLiquidity = bigintEnv('MOCK_FLASH_SETTLEMENT_WETH_LIQUIDITY', 100n * WeiPerEther)

function throwIfAborted(signal: AbortSignal, label: string) {
  if (signal.aborted) throw new Error(`${label} was cancelled`)
}

function createProvider(signal: AbortSignal) {
  const provider = new JsonRpcProvider(anvilRpcUrl, anvilChainId, {
    batchMaxCount: 1,
    pollingInterval: 250,
    staticNetwork: true
  })
  const stop = () => provider.destroy()
  signal.addEventListener('abort', stop, { once: true })

  return {
    provider,
    close() {
      signal.removeEventListener('abort', stop)
      provider.destroy()
    }
  }
}

async function runProcess(name: string, command: string, args: string[], signal: AbortSignal) {
  throwIfAborted(signal, name)
  const service = new ProcessService({
    name,
    command,
    args,
    spawn: {
      cwd: contractsDir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    },
    exitIsFailure: false
  })
  const stop = () => void service.stop()
  signal.addEventListener('abort', stop, { once: true })

  try {
    const handle = await service.start()
    await expectSuccessfulExit(handle, name)
  } finally {
    signal.removeEventListener('abort', stop)
    await service.stop()
  }
}

async function contractArtifact(relativePath: string) {
  const artifactPath = path.join(contractsDir, 'out', relativePath)
  const artifact = JSON.parse(await readFile(artifactPath, 'utf8')) as ContractArtifact
  const bytecode = artifact.deployedBytecode?.object

  if (!artifact.abi) throw new Error(`Artifact has no ABI: ${artifactPath}`)
  if (!bytecode || bytecode === '0x') throw new Error(`Artifact has no deployed bytecode: ${artifactPath}`)

  return {
    bytecode,
    interface: new Interface(artifact.abi)
  }
}

async function waitForTransaction(transaction: Promise<TransactionResponse>, label: string) {
  const response = await transaction
  const receipt = await response.wait(1)

  if (!receipt || receipt.status !== 1) throw new Error(`${label} transaction failed: ${response.hash}`)

  return receipt
}

async function deployMulticall3(provider: JsonRpcProvider, signer: NonceManager) {
  const signedTransaction = (await readFile(multicall3SignedTransactionPath, 'utf8')).trim()

  await waitForTransaction(
    signer.sendTransaction({ to: multicall3DeployerAddress, value: WeiPerEther / 10n }),
    'Multicall3 deployer funding'
  )
  const receipt = await waitForTransaction(
    provider.broadcastTransaction(signedTransaction),
    'Multicall3 deployment'
  )

  if (receipt.contractAddress?.toLowerCase() !== multicall3Address.toLowerCase()) {
    throw new Error(
      `Multicall3 deployed at ${receipt.contractAddress || 'no address'}, expected ${multicall3Address}`
    )
  }
}

async function assertSeeded(provider: JsonRpcProvider, usdc: Contract, weth: Contract) {
  const balances = await Promise.all([
    provider.getBalance(harnessAccountAddress),
    usdc.balanceOf(harnessAccountAddress) as Promise<bigint>,
    weth.balanceOf(harnessAccountAddress) as Promise<bigint>,
    usdc.balanceOf(mockFlashSettlementAddress) as Promise<bigint>,
    weth.balanceOf(mockFlashSettlementAddress) as Promise<bigint>
  ])
  const expectedBalances = [
    harnessEthBalance,
    harnessUsdcBalance,
    harnessWethBalance,
    settlementUsdcLiquidity,
    settlementWethLiquidity
  ]

  expectedBalances.forEach((expected, index) => {
    if (balances[index] !== expected) {
      throw new Error(`Anvil seed balance ${index} was ${balances[index]}, expected ${expected}`)
    }
  })

  const codes = await Promise.all([
    provider.getCode(multicall3Address),
    provider.getCode(testContractAddress),
    provider.getCode(usdcAddress),
    provider.getCode(wethAddress),
    provider.getCode(mockFlashSettlementAddress)
  ])
  codes.forEach((code, index) => {
    if (code === '0x') throw new Error(`Anvil seed contract ${index} has no code`)
  })
}

async function seedAnvil(signal: AbortSignal) {
  await runProcess('contracts build', 'forge', ['build'], signal)
  await waitForAnvil()
  throwIfAborted(signal, 'Anvil seed')

  const [usdcArtifact, wethArtifact, settlementArtifact, testContractArtifact] = await Promise.all([
    contractArtifact(artifacts.usdc),
    contractArtifact(artifacts.weth),
    contractArtifact(artifacts.mockFlashSettlement),
    contractArtifact(artifacts.testContract)
  ])
  const managed = createProvider(signal)
  const { provider } = managed

  try {
    await provider.send('anvil_setBalance', [harnessAccountAddress, toQuantity(harnessEthBalance)])
    await Promise.all([
      provider.send('anvil_setCode', [usdcAddress, usdcArtifact.bytecode]),
      provider.send('anvil_setCode', [wethAddress, wethArtifact.bytecode]),
      provider.send('anvil_setCode', [mockFlashSettlementAddress, settlementArtifact.bytecode]),
      provider.send('anvil_setCode', [testContractAddress, testContractArtifact.bytecode])
    ])

    const signer = new NonceManager(new Wallet(anvilDeployerPrivateKey, provider))
    await deployMulticall3(provider, signer)

    const usdc = new Contract(usdcAddress, usdcArtifact.interface, signer)
    const weth = new Contract(wethAddress, wethArtifact.interface, signer)

    await waitForTransaction(usdc.mint(harnessAccountAddress, harnessUsdcBalance), 'harness USDC mint')
    await waitForTransaction(
      usdc.mint(mockFlashSettlementAddress, settlementUsdcLiquidity),
      'settlement USDC mint'
    )
    await waitForTransaction(weth.deposit({ value: harnessWethBalance }), 'harness WETH deposit')
    await waitForTransaction(
      weth.transfer(harnessAccountAddress, harnessWethBalance),
      'harness WETH transfer'
    )
    await waitForTransaction(weth.deposit({ value: settlementWethLiquidity }), 'settlement WETH deposit')
    await waitForTransaction(
      weth.transfer(mockFlashSettlementAddress, settlementWethLiquidity),
      'settlement WETH transfer'
    )
    await assertSeeded(provider, usdc, weth)
  } finally {
    managed.close()
  }
}

export function createSeedAnvilService() {
  return new TaskService('anvil seed', seedAnvil)
}
