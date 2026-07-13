import { anvilChainId } from '../../core/config.ts'
import { expectSuccessfulExit } from '../../core/process-service.ts'
import { createContractsCommandService } from '../../services/contracts.ts'
import type { VisualStage } from '../types.ts'
import { requireAccounts } from './helpers.ts'

export const networkOnboardingStage: VisualStage = {
  name: 'dapp connect and add anvil',
  async run(context) {
    const { driver, runtime, services, tray } = context
    const { harness } = await requireAccounts(context)
    const ensureChain = await services.start(
      createContractsCommandService('contracts ensure-newframe-chain', 'ensure-newframe-chain')
    )

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

    await services.watch(expectSuccessfulExit(ensureChain, 'contracts ensure-newframe-chain'))
  }
}
