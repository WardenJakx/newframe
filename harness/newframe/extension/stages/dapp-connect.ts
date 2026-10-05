import { toQuantity } from 'ethers'

import { anvilChainId } from '../../core/config.ts'
import { sleep } from '../../core/utils.ts'
import { requireAccounts } from '../../visual/stages/helpers.ts'
import type { ExtensionStage } from '../types.ts'
import { dappResult, inPopup, waitForDappOutput } from './helpers.ts'

export const dappConnectStage: ExtensionStage = {
  name: 'dapp connects and adds anvil',
  async run(context) {
    const { driver, extension, runtime, tray } = context
    const { dapp } = extension
    const { harness } = await requireAccounts(context)

    await dapp.getByRole('button', { name: 'Connect', exact: true }).click()
    const access = await driver.waitForCurrentRequest('access', new Set(), 30_000)
    runtime.evidence('dappAccessRequestId', access.requestId)
    await runtime.screenshot(tray, 'ext-02-tray-dapp-access-request.png')
    await driver.approveAccessRequest(access)
    await dappResult(dapp)
    await waitForDappOutput(dapp, 'Account', harness.address)
    await runtime.screenshot(dapp, 'ext-02-dapp-connected.png')

    await dapp.getByRole('button', { name: 'Add Anvil chain' }).click()
    const addChain = await driver.waitForCurrentRequest('addChain', new Set(), 30_000)
    runtime.evidence('addChainRequestId', addChain.requestId)
    await driver.openAddChainReview(addChain)
    await tray.getByRole('dialog', { name: 'Add Chain' }).waitFor({ state: 'visible' })
    // The overlay fades in.
    await sleep(500)
    await runtime.screenshot(tray, 'ext-02-tray-add-chain-review.png')
    await driver.approveAddChainRequest()
    // Adding a chain leaves the tray on its network list.
    const networks = tray.getByRole('dialog', { name: 'Networks' })
    await networks.waitFor({ state: 'visible' })
    await networks.getByRole('button', { name: 'Back' }).click()
    await networks.waitFor({ state: 'hidden' })

    await dappResult(dapp)
    await waitForDappOutput(dapp, 'Chain', toQuantity(anvilChainId))
    runtime.evidence('addedChainId', anvilChainId)

    await inPopup(extension, async (popup) => {
      await popup.getByText('Connected', { exact: true }).waitFor()
      await popup.getByRole('button', { name: 'Disconnect this site' }).waitFor()
      await runtime.screenshot(popup, 'ext-02-popup-site-connected.png')
    })
  }
}
