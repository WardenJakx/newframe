import { isDeepStrictEqual } from 'node:util'

import { formatUnits } from 'ethers'

import type { VisualStage } from '../types.ts'

export const safeWatchStage: VisualStage = {
  name: 'watch Safe and inspect proposal',
  async run({ driver, runtime, tray, safeSeed }) {
    const original = await driver.getAppState()
    const selected = original.main?.accounts?.[original.main.currentAccount ?? '']
    const id = safeSeed.safe.toLowerCase()
    const chain = String(safeSeed.chainId)
    try {
      await tray.getByRole('button', { name: 'Accounts', exact: true }).click()
      const accounts = tray.getByRole('dialog', { name: 'Accounts' })
      await accounts.getByRole('button', { name: 'Add account', exact: true }).click()
      await accounts.getByRole('button', { name: 'Safe', exact: true }).click()
      const addressInput = accounts.getByRole('textbox', { name: 'Safe address' })
      await addressInput.click()
      await addressInput.fill(safeSeed.safe)
      await addressInput.press('Tab')
      if ((await addressInput.inputValue()) !== safeSeed.safe) {
        runtime.fail('Safe address input did not retain the entered address')
      }
      // Discovery waits for configured RPCs, whose timeout is 15 seconds.
      await accounts
        .getByRole('button', { name: 'Import 1 Safe network', exact: true })
        .click({ timeout: 20_000 })
      await accounts.getByText('Imported · Watch-only', { exact: true }).waitFor()
      const imported = await driver.waitForState(
        (state) => Boolean(state.main?.accounts?.[id]?.safe?.[chain]?.pending?.length),
        15_000,
        'Safe import did not populate canonical queue'
      )
      const deployment = imported.main!.accounts![id].safe![chain]
      if (
        deployment.configuration.threshold !== safeSeed.threshold ||
        deployment.configuration.version !== safeSeed.version ||
        deployment.configuration.owners.join().toLowerCase() !== safeSeed.owners.join().toLowerCase()
      ) {
        runtime.fail('Safe configuration differs from deployed contract')
      }
      await runtime.screenshot(tray, '08b-safe-import.png')
      await accounts.getByRole('button', { name: 'Close accounts', exact: true }).click()
      await driver.waitForSelectedAccount({ id, address: id })
      await tray.getByRole('button', { name: /^\d+ pending requests?$/ }).click()
      await tray.getByRole('button', { name: 'Refresh requests' }).click()
      await driver.waitForState(
        (state) =>
          (state.main?.accounts?.[id]?.safe?.[chain]?.refreshedAt ?? 0) > (deployment.refreshedAt ?? 0),
        15_000,
        'Safe refresh did not complete'
      )
      if (!deployment.pending?.some((proposal) => proposal.integrity?.status === 'matched')) {
        runtime.fail('No locally matched Safe hashes')
      }
      if (!deployment.pending?.some((proposal) => proposal.localDecoded?.method === 'transfer')) {
        runtime.fail('Safe calldata was not locally decoded')
      }
      await runtime.screenshot(tray, '08c-safe-queue.png')
      const proposal = deployment.pending!.find(
        (proposal) =>
          proposal.operation === 0 &&
          proposal.data === '0x' &&
          proposal.value === '0' &&
          proposal.integrity?.status === 'matched'
      )
      if (!proposal) {
        return runtime.fail('Seed has no matched zero-value native proposal')
      }
      const hash = proposal.safeTxHash
      await tray.getByRole('button', { name: `Open Safe proposal ${hash} on chain ${chain}` }).click()
      const details = tray.getByRole('dialog', { name: 'Requests' })
      const captureReview = async (filename: string) => {
        const headerVisible = await details.evaluate(async (element) => {
          await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished))
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
          const headers = element.querySelectorAll('header')
          const bounds = headers[0]?.getBoundingClientRect()
          return headers.length === 1 && bounds.top >= 0 && bounds.bottom <= innerHeight
        })
        if (!headerVisible) {
          runtime.fail('Request review must keep its only header visible after scrolling')
        }
        await runtime.screenshot(tray, filename)
      }
      if ((await details.locator('header').count()) !== 1) {
        runtime.fail('Request review must have one header')
      }
      const effects = details.getByLabel('Transaction effects', { exact: true })
      await effects.getByText('No supported asset changes detected.', { exact: true }).waitFor()
      await effects.getByText('Newframe Local Anvil', { exact: true }).waitFor()
      for (const label of ['To', 'Account', 'Signer', 'Safe transaction hash']) {
        await details.getByText(label, { exact: true }).first().waitFor()
      }
      await details
        .getByRole('button', {
          name: `${proposal.confirmations.length} / ${deployment.configuration.threshold} confirmations`,
          exact: true
        })
        .click()
      await details.getByText(`Send ${formatUnits(proposal.value, 18)} ETH`, { exact: true }).waitFor()
      await details.getByRole('button', { name: 'Raw transaction', exact: true }).click()
      const rawTransaction = details.locator('code').filter({ hasText: '"safe"' })
      await rawTransaction.waitFor()
      const raw: unknown = JSON.parse((await rawTransaction.textContent()) ?? '{}')
      if (
        !isDeepStrictEqual(raw, {
          safe: proposal.safe,
          to: proposal.to,
          value: proposal.value,
          data: proposal.data,
          operation: proposal.operation,
          nonce: proposal.nonce,
          safeTxGas: proposal.safeTxGas,
          baseGas: proposal.baseGas,
          gasPrice: proposal.gasPrice,
          gasToken: proposal.gasToken,
          refundReceiver: proposal.refundReceiver
        })
      ) {
        runtime.fail('Raw Safe transaction differs from the canonical proposal')
      }
      await details.getByRole('button', { name: 'Raw transaction', exact: true }).click()
      const hashValue = details.getByText(hash, { exact: true })
      await hashValue.waitFor()
      const hashFits = await hashValue.evaluate((element) => {
        const dialog = element.closest('[role=dialog]')!
        const bounds = dialog.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(element)
        return Array.from(range.getClientRects()).every(
          (rect) => rect.left >= bounds.left && rect.right <= bounds.right
        )
      })
      if (!hashFits) {
        runtime.fail('Safe transaction hash extends outside proposal details')
      }
      runtime.evidence('safeHashFits', hashFits)
      await details.getByRole('button', { name: /Show full calldata/ }).click()
      await details.getByText('Full calldata', { exact: true }).waitFor()
      await details.getByText('0x', { exact: true }).waitFor()
      if (await details.getByRole('button', { name: /^(Approve|Execute|Reject|Replace|Submit)$/i }).count()) {
        runtime.fail('Safe proposal exposes unsupported execution controls')
      }
      await details.getByRole('button', { name: 'Sign', exact: true }).click({ trial: true })
      await captureReview('08d-safe-proposal.png')
      runtime.evidence('safeAddress', safeSeed.safe)
      runtime.evidence('safeVersion', safeSeed.version)
      runtime.evidence('safePendingCount', deployment.pending!.length)
      runtime.evidence('safeSimulation', 'success')
      runtime.evidence('safeOwnerCanSign', true)
      await details.getByRole('button', { name: 'Back to requests' }).click()
      const delegate = deployment.pending!.find((proposal) => proposal.operation === 1)
      if (!delegate) {
        return runtime.fail('Seed has no delegate proposal')
      }
      await tray
        .getByRole('button', { name: `Open Safe proposal ${delegate.safeTxHash} on chain ${chain}` })
        .click()
      await details.getByRole('alert', { name: 'Delegatecall warning' }).waitFor()
      await effects.getByText('No supported asset changes detected.', { exact: true }).waitFor()
      await details.getByText('Waiting for earlier transactions', { exact: true }).waitFor()
      await details.getByRole('button', { name: /Show full calldata/ }).click()
      await details.getByText(delegate.data, { exact: true }).waitFor()
      if (
        (await details.getByText(/^Call transfer$/).count()) ||
        (await effects.getByRole('group').count())
      ) {
        runtime.fail('Unknown delegate proposal fabricates decoded or simulated effects')
      }
      if (await details.getByRole('button', { name: /^(Approve|Execute|Reject|Replace|Submit)$/i }).count()) {
        runtime.fail('Delegate proposal exposes unsupported execution controls')
      }
      await captureReview('08e-safe-delegate-raw.png')
      runtime.evidence('safeDelegateRaw', delegate.data)
      await details.getByRole('button', { name: 'Back to requests' }).click()
      const mismatch = deployment.pending!.find((proposal) => proposal.integrity?.status === 'mismatch')
      if (!mismatch) {
        return runtime.fail('Seed has no integrity mismatch')
      }
      await tray
        .getByRole('button', { name: `Open Safe proposal ${mismatch.safeTxHash} on chain ${chain}` })
        .click()
      await details.getByRole('alert', { name: 'Proposal integrity' }).waitFor()
      if (!(await details.getByRole('button', { name: 'Sign', exact: true }).isDisabled())) {
        runtime.fail('Integrity mismatch must disable Safe signing')
      }
      await details.getByText('Locally computed hash', { exact: true }).waitFor()
      await details.evaluate(async (element) => {
        await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished))
      })
      await details.getByRole('alert', { name: 'Proposal integrity' }).scrollIntoViewIfNeeded()
      await captureReview('08f-safe-integrity-mismatch.png')
      runtime.evidence('safeIntegrityMismatchVisible', true)
      await details.getByRole('button', { name: 'Back to requests' }).click()
      await tray
        .getByRole('dialog', { name: 'Requests' })
        .getByRole('button', { name: 'Back', exact: true })
        .click()
      await tray.getByRole('button', { name: 'Accounts', exact: true }).click()
      await accounts.getByRole('textbox', { name: 'Search accounts' }).fill(id)
      const safeRow = accounts.getByRole('button', {
        name: `Safe Account ${id.slice(0, 5)}…${id.slice(-4)}`,
        exact: true
      })
      await safeRow.getByRole('button', { name: 'Safe Account account actions', exact: true }).click()
      await accounts.getByRole('button', { name: 'Remove account', exact: true }).click()
      await accounts.getByRole('button', { name: 'Confirm remove', exact: true }).click()
      await driver.waitForState(
        (state) => !state.main?.accounts?.[id],
        5000,
        'Safe removal did not remove account'
      )
      await accounts.getByRole('button', { name: 'Close accounts', exact: true }).click()
      runtime.evidence('safeRemoved', true)
    } catch (error) {
      // Preserve the failed review before account cleanup removes it from the renderer.
      await runtime.screenshot(tray, 'debug-safe-review.png').catch(() => undefined)
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
