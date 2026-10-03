import { toQuantity } from 'ethers'

import { anvilChainId, anvilRpcUrl, newframeRpcUrl } from '../../core/config.ts'
import { HarnessExtension, harnessExtensionId } from '../../core/extension.ts'
import { TaskService } from '../../core/task-service.ts'
import { sleep } from '../../core/utils.ts'
import { waitForAnvil } from '../../services/anvil.ts'
import { harnessOrigin } from '../driver.ts'
import type { VisualStage } from '../types.ts'
import { requireAccounts } from './helpers.ts'

const harnessOriginUrl = process.env.NEWFRAME_ORIGIN ?? 'http://newframe-contracts.local'

type WebsiteProvider = ReturnType<HarnessExtension['website']>

async function hasNewframeAnvilChain(provider: WebsiteProvider, signal: AbortSignal) {
  try {
    return Number(await provider.send('eth_chainId', [])) === anvilChainId
  } catch (error) {
    if (signal.aborted) {
      throw error
    }
    return false
  }
}

async function ensureNewframeAnvilChain(signal: AbortSignal) {
  await waitForAnvil()
  // The first request asks Newframe to approve the extension; connecting the website then asks
  // which accounts the extension may use before Newframe asks for website access.
  const extension = await HarnessExtension.connect(newframeRpcUrl)
  const stop = () => extension.close()
  signal.addEventListener('abort', stop, { once: true })
  const base = extension.website(harnessOriginUrl)
  const target = extension.website(harnessOriginUrl, anvilChainId)

  try {
    await base.send('eth_requestAccounts', [])
    if (await hasNewframeAnvilChain(target, signal)) {
      return
    }

    await base.send('wallet_addEthereumChain', [
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
      if (await hasNewframeAnvilChain(target, signal)) {
        return
      }
      await sleep(500)
    }

    throw new Error(`Newframe did not connect to Anvil chain ${anvilChainId}`)
  } finally {
    signal.removeEventListener('abort', stop)
    target.destroy()
    base.destroy()
    extension.close()
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

    await driver.approveExtensionConnection('06-extension-connect-request.png')
    await driver.shareExtensionAccounts([harness.address], '06-extension-account-access.png')
    const extensionState = await driver.waitForState(
      (state) => Boolean(state.main?.extensionAccess?.[harnessExtensionId]?.accounts?.includes(harness.id)),
      5_000,
      'The harness account was not shared with the harness extension'
    )
    runtime.evidence(
      'extensionSharedAccounts',
      extensionState.main?.extensionAccess?.[harnessExtensionId]?.accounts?.length ?? 0
    )

    const accessRequest = await driver
      .waitForCurrentRequest('access', new Set(), 20_000)
      .catch(() => undefined)
    if (accessRequest) {
      await runtime.screenshot(tray, '06-dapp-connect-request.png')
      await tray.getByRole('button', { name: 'Back' }).click()

      const pendingRequests = tray.getByRole('button', { name: '1 pending request' })
      await pendingRequests.waitFor({ state: 'visible' })
      await sleep(500)
      await runtime.screenshot(tray, '06-pending-request-notification.png')

      await pendingRequests.click()
      const requests = tray.getByRole('dialog', { name: 'Requests' })
      await requests.waitFor({ state: 'visible' })
      await sleep(500)
      await runtime.screenshot(tray, '06a-requests-overlay.png')
      await requests.getByRole('button', { name: 'Back' }).click()
      await requests.waitFor({ state: 'hidden' })

      await driver.approveAccessRequest(accessRequest)
    }

    const addChainRequest = await driver.waitForCurrentRequest('addChain', new Set(), 60_000)
    await runtime.screenshot(tray, '07-add-chain-request-card.png')
    await driver.openAddChainReview(addChainRequest)
    await tray.getByRole('dialog', { name: 'Add Chain' }).waitFor({ state: 'visible', timeout: 10_000 })
    await runtime.screenshot(tray, '08-add-chain-review.png')
    await driver.approveAddChainRequest()
    await driver.waitForState(
      (state) => Boolean(state.main?.networks?.ethereum?.[String(anvilChainId)]),
      10_000,
      'Newframe did not add the local Anvil network'
    )
    runtime.evidence('addedChainId', anvilChainId)
    runtime.evidence('authorizedOrigin', harnessOrigin)
    await driver.setNativeAnvilBalance(harness)

    const networks = tray.getByRole('dialog', { name: 'Networks' })
    await networks.waitFor({ state: 'visible' })
    await networks.getByRole('button', { name: 'Back' }).click()
    await tray.getByRole('button', { name: 'Main menu' }).click()
    const menu = tray.getByRole('dialog', { name: 'Main menu' })
    await menu.getByRole('button', { name: 'Dapps' }).click()
    const dapps = tray.getByRole('dialog', { name: 'Dapps' })
    await dapps.getByText(harnessOrigin, { exact: false }).waitFor({ state: 'visible' })
    await runtime.screenshot(tray, '08a-current-account-dapp-permissions.png')
    await dapps.getByRole('button', { name: 'Back' }).click()
    await menu.getByRole('button', { name: 'Close menu' }).click()

    await services.watch(ensureChain.completed)
  }
}
