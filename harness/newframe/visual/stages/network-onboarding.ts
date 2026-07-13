import { FetchRequest, JsonRpcProvider, toQuantity } from 'ethers'

import { anvilChainId, anvilRpcUrl, newframeRpcUrl } from '../../core/config.ts'
import { TaskService } from '../../core/task-service.ts'
import { sleep } from '../../core/utils.ts'
import { waitForAnvil } from '../../services/anvil.ts'
import type { VisualStage } from '../types.ts'
import { requireAccounts } from './helpers.ts'

const harnessOriginUrl = process.env.NEWFRAME_ORIGIN || 'http://newframe-contracts.local'

function createProvider(url: string, signal: AbortSignal, chainId?: number) {
  const request = new FetchRequest(url)
  request.setHeader('Origin', harnessOriginUrl)
  const provider = new JsonRpcProvider(request, chainId, {
    batchMaxCount: 1,
    pollingInterval: 250,
    ...(chainId ? { staticNetwork: true } : {})
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

async function hasNewframeAnvilChain(provider: JsonRpcProvider, signal: AbortSignal) {
  try {
    return Number(await provider.send('eth_chainId', [])) === anvilChainId
  } catch (error) {
    if (signal.aborted) throw error
    return false
  }
}

async function ensureNewframeAnvilChain(signal: AbortSignal) {
  await waitForAnvil()
  const base = createProvider(newframeRpcUrl, signal)
  const target = createProvider(`${newframeRpcUrl}?chainId=${anvilChainId}`, signal, anvilChainId)

  try {
    await base.provider.send('eth_chainId', [])
    if (await hasNewframeAnvilChain(target.provider, signal)) return

    await base.provider.send('wallet_addEthereumChain', [
      {
        blockExplorerUrls: [],
        chainId: toQuantity(anvilChainId),
        chainName: 'Newframe Local Anvil',
        nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
        rpcUrls: [anvilRpcUrl]
      }
    ])

    const started = Date.now()
    while (Date.now() - started < 60_000) {
      if (await hasNewframeAnvilChain(target.provider, signal)) return
      await sleep(500)
    }

    throw new Error(`Newframe did not connect to Anvil chain ${anvilChainId}`)
  } finally {
    target.close()
    base.close()
  }
}

function createEnsureNewframeAnvilChainService() {
  return new TaskService('ensure Newframe Anvil chain', ensureNewframeAnvilChain)
}

export const networkOnboardingStage: VisualStage = {
  name: 'dapp connect and add anvil',
  async run(context) {
    const { driver, runtime, services, tray } = context
    const { harness } = await requireAccounts(context)
    const ensureChain = await services.start(createEnsureNewframeAnvilChainService())

    const accessRequest = await driver
      .waitForCurrentRequest('access', new Set(), 20_000)
      .catch(() => undefined)
    if (accessRequest) {
      await runtime.screenshot(tray, '06-dapp-connect-request.png')
      // TODO: the access footer action is non-semantic; use the app bridge until it exposes a role/name.
      await driver.linkSend(tray, 'tray:giveAccess', accessRequest, true)
    }

    const addChainRequest = await driver.waitForCurrentRequest('addChain', new Set(), 60_000)
    const addChain = driver.normalizeAddChain(addChainRequest.chain)
    await runtime.screenshot(tray, '07-add-chain-request-card.png')
    await driver.trayAction('navHome', {
      view: 'addChain',
      data: { chain: addChain, request: addChainRequest }
    })
    await tray.getByRole('dialog', { name: 'Add Chain' }).waitFor({ state: 'visible', timeout: 10_000 })
    await runtime.screenshot(tray, '08-add-chain-review.png')
    // TODO: the synthetic click is unreliable; use the same app bridge as the visible action.
    await driver.linkSend(tray, 'tray:addChain', addChain, addChainRequest)
    await driver.trayAction('navHome', { view: 'networks' })
    await driver.waitForState(
      (state) => Boolean(state.main?.networks?.ethereum?.[String(anvilChainId)]),
      10_000,
      'Newframe did not add the local Anvil network'
    )
    await driver.setNativeAnvilBalance(harness)
    void driver.refreshBalances(harness)

    await services.watch(ensureChain.completed)
  }
}
