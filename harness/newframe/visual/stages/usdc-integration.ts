import { expectSuccessfulExit } from '../../core/process-service.ts'
import { createContractsCommandService } from '../../services/contracts.ts'
import type { VisualStage } from '../types.ts'
import { requireAccounts } from './helpers.ts'

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

    const integration = await services.start(
      createContractsCommandService('contracts integration-usdc', 'integration-usdc')
    )
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

    await services.watch(expectSuccessfulExit(integration, 'contracts integration-usdc'))
  }
}
