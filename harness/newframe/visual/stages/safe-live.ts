import fsp from 'node:fs/promises'
import path from 'node:path'

import type { Locator } from 'playwright-core'

import type { SafeDeployment } from '../../../../apps/newframe/src/features/accounts/domain/safe.ts'
import type { VisualStage } from '../types.ts'

// A live multi-chain Safe whose queue holds MultiSend batches and single calls on public chains.
const liveSafe = '0x4d8D99be16a38D5809f3A9BcDc221c45a56A6d44'
const multiSendSelector = '0x8d80ff0a'

async function settle(region: Locator) {
  await region.evaluate(async (element) => {
    const finite = element
      .getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
    await Promise.all(finite.map((animation) => animation.finished))
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
}

export const safeLiveStage: VisualStage = {
  name: 'review a live Safe queue',
  async run({ driver, runtime, tray }) {
    const original = await driver.getAppState()
    const selected = original.main?.accounts?.[original.main.currentAccount ?? '']
    const id = liveSafe.toLowerCase()
    try {
      await tray.getByRole('button', { name: 'Accounts', exact: true }).click()
      const accounts = tray.getByRole('dialog', { name: 'Accounts' })
      await accounts.getByRole('button', { name: 'Add account', exact: true }).click()
      await accounts.getByRole('button', { name: 'Safe', exact: true }).click()
      const addressInput = accounts.getByRole('textbox', { name: 'Safe address' })
      await addressInput.fill(liveSafe)
      await addressInput.press('Tab')
      await accounts.getByRole('button', { name: /^Import \d+ Safe networks?$/ }).click({ timeout: 60_000 })
      await driver.waitForState(
        (state) => Object.keys(state.main?.accounts?.[id]?.safe ?? {}).length > 0,
        90_000,
        'Live Safe import did not add any chain'
      )
      await accounts.getByRole('button', { name: 'Close accounts', exact: true }).click()
      // A profile can already hold this Safe with an old queue, so force a fresh read of every chain.
      const startedAt = Date.now()
      await driver.executeCommand(tray, { type: 'account.refresh', accountId: id, force: true })
      const refreshed = await driver.waitForState(
        (state) =>
          Object.values(state.main?.accounts?.[id]?.safe ?? {}).every(
            (deployment) => (deployment.refreshedAt ?? 0) >= startedAt || deployment.error
          ),
        120_000,
        'Live Safe queues did not refresh'
      )
      const deployments: SafeDeployment[] = Object.values(refreshed.main!.accounts![id].safe!)
      await fsp.writeFile(
        path.join(runtime.outputDir, 'safe-live-deployments.json'),
        JSON.stringify(deployments, null, 2)
      )
      const proposals = deployments.flatMap((deployment) =>
        (deployment.pending ?? []).map((proposal) => ({ chainId: deployment.chainId, proposal }))
      )
      runtime.evidence('safeLiveChains', deployments.map((deployment) => deployment.chainId).join(','))
      runtime.evidence('safeLiveProposals', proposals.length)
      if (!proposals.length) {
        runtime.log('live Safe has no pending proposals; nothing to review')
        return
      }
      const batches = proposals.filter(({ proposal }) => proposal.data.startsWith(multiSendSelector))
      if (batches.some(({ proposal }) => !proposal.batch?.length)) {
        runtime.fail('A live MultiSend proposal was not split into its calls')
      }

      await driver.setSelectedAccount({ id, address: id })
      await tray.getByRole('button', { name: /^\d+ pending requests?$/ }).click()
      const queue = tray.getByRole('region', { name: 'Account requests' })
      await queue.waitFor()
      const requests = tray.getByRole('dialog', { name: 'Requests' })
      await settle(requests)
      await runtime.screenshot(tray, '08m-safe-live-queue.png')
      const simulations: Record<string, unknown> = {}
      for (const { chainId, proposal } of proposals) {
        const name = `${chainId}-${proposal.nonce}`
        await tray
          .getByRole('button', { name: `Open Safe proposal ${proposal.safeTxHash} on chain ${chainId}` })
          .click()
        const effects = requests.getByLabel('Transaction effects', { exact: true })
        await effects
          .getByText('Simulating…', { exact: true })
          .waitFor({ state: 'detached', timeout: 60_000 })
        await settle(requests)
        if (proposal.batch) {
          await requests.getByText(`${proposal.batch.length} actions`, { exact: true }).waitFor()
          if ((await requests.getByText('multiSend').count()) !== 0) {
            runtime.fail(`Batch ${name} still shows the MultiSend call`)
          }
        }
        await runtime.screenshot(tray, `08n-safe-live-${name}.png`)
        await requests.getByLabel('Verification details').scrollIntoViewIfNeeded()
        await settle(requests)
        await runtime.screenshot(tray, `08o-safe-live-${name}-details.png`)
        // safe.simulate answers with the bare simulation, which the driver's ok-result helper rejects.
        const simulation = await tray.evaluate(
          (query) =>
            (
              window as unknown as { __NEWFRAME_HOST__: { executeQuery(query: unknown): Promise<unknown> } }
            ).__NEWFRAME_HOST__.executeQuery(query),
          { type: 'safe.simulate', accountId: id, chainId, safeTxHash: proposal.safeTxHash }
        )
        simulations[proposal.safeTxHash] = simulation
        runtime.evidence(`safeLiveSimulation${name}`, (await effects.textContent())?.slice(0, 200) ?? '')
        await requests.getByRole('button', { name: 'Back to requests' }).click()
        await queue.waitFor()
      }
      await fsp.writeFile(
        path.join(runtime.outputDir, 'safe-live-simulations.json'),
        JSON.stringify(simulations, null, 2)
      )
      await requests.getByRole('button', { name: 'Back', exact: true }).click()
      await requests.waitFor({ state: 'hidden' })
    } catch (error) {
      await runtime.screenshot(tray, 'debug-safe-live.png').catch(() => undefined)
      throw error
    } finally {
      if ((await driver.getAppState()).main?.accounts?.[id]) {
        await driver.executeCommand(tray, { type: 'account.remove', address: id })
      }
      if (selected) {
        await driver.setSelectedAccount(selected)
      }
    }
  }
}
