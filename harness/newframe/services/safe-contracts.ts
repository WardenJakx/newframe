import fallbackHandlerArtifact from '@safe-global/safe-smart-account/build/artifacts/contracts/handler/CompatibilityFallbackHandler.sol/CompatibilityFallbackHandler.json' with { type: 'json' }
import factoryArtifact from '@safe-global/safe-smart-account/build/artifacts/contracts/proxies/SafeProxyFactory.sol/SafeProxyFactory.json' with { type: 'json' }
import safeArtifact from '@safe-global/safe-smart-account/build/artifacts/contracts/SafeL2.sol/SafeL2.json' with { type: 'json' }
import {
  Contract,
  ContractFactory,
  Interface,
  TransactionResponse,
  ZeroAddress,
  getAddress,
  type JsonRpcProvider,
  type NonceManager
} from 'ethers'

export type SafeSeedManifest = {
  chainId: number
  safe: string
  singleton: string
  factory: string
  fallbackHandler: string
  owners: string[]
  threshold: number
  nonce: string
  version: string
}

export async function seedSafe(
  provider: JsonRpcProvider,
  signer: NonceManager,
  chainId: number,
  harnessOwner: string
): Promise<SafeSeedManifest> {
  const owners = [getAddress(harnessOwner), getAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8')]
  const threshold = 1
  async function deploy(
    artifact: typeof safeArtifact | typeof factoryArtifact | typeof fallbackHandlerArtifact
  ) {
    const contract = await new ContractFactory(artifact.abi, artifact.bytecode, signer).deploy()
    const receipt = await contract.deploymentTransaction()!.wait(1)
    if (receipt?.status !== 1 || !receipt.contractAddress) {
      throw new Error('Safe contract deployment failed')
    }
    return receipt.contractAddress
  }
  const singleton = await deploy(safeArtifact)
  const factory = await deploy(factoryArtifact)
  const fallbackHandler = await deploy(fallbackHandlerArtifact)
  const abi = new Interface(safeArtifact.abi)
  const initializer = abi.encodeFunctionData('setup', [
    owners,
    threshold,
    ZeroAddress,
    '0x',
    fallbackHandler,
    ZeroAddress,
    0,
    ZeroAddress
  ])
  const proxyFactory = new Contract(factory, factoryArtifact.abi, signer)
  const transaction: unknown = await proxyFactory.createProxyWithNonce(singleton, initializer, 20260908)
  if (!(transaction instanceof TransactionResponse)) {
    throw new Error('Safe proxy creation returned an invalid transaction')
  }
  const receipt = await transaction.wait(1)
  if (receipt?.status !== 1) {
    throw new Error('Safe proxy creation failed')
  }
  let safe: string | undefined
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== factory.toLowerCase()) {
      continue
    }
    const event = proxyFactory.interface.parseLog(log)
    if (event?.name === 'ProxyCreation') {
      const proxy: unknown = event.args.proxy
      if (typeof proxy !== 'string') {
        throw new Error('Safe proxy receipt contained an invalid proxy address')
      }
      safe = getAddress(proxy)
    }
  }
  if (!safe) {
    throw new Error('Safe proxy receipt missing ProxyCreation')
  }
  const contract = new Contract(safe, abi, provider)
  const [actualOwners, actualThreshold, nonce, version, codes] = await Promise.all([
    contract.getOwners() as Promise<string[]>,
    contract.getThreshold() as Promise<bigint>,
    contract.nonce() as Promise<bigint>,
    contract.VERSION() as Promise<string>,
    Promise.all([singleton, factory, fallbackHandler, safe].map((address) => provider.getCode(address)))
  ])
  if (
    codes.some((code) => code === '0x') ||
    actualOwners.map(getAddress).join() !== owners.join() ||
    actualThreshold !== BigInt(threshold) ||
    nonce !== 0n ||
    version !== '1.5.0'
  ) {
    throw new Error('Safe seed verification failed')
  }
  return {
    chainId,
    safe,
    singleton,
    factory,
    fallbackHandler,
    owners,
    threshold,
    nonce: nonce.toString(),
    version
  }
}
