import type { VisualStage } from '../types.ts'

export const safeWatchStage: VisualStage = {
  name: 'watch Safe and inspect proposal',
  async run({ driver, runtime, tray, safeSeed }) {
    const original = await driver.getAppState()
    const selected = original.main?.accounts?.[original.main.currentAccount || '']
    const id = safeSeed.safe.toLowerCase()
    const chain = String(safeSeed.chainId)
    try {
      await tray.getByRole('button', { name: 'Accounts', exact: true }).click()
      const accounts = tray.getByRole('dialog', { name: 'Accounts' })
      await accounts.getByRole('button', { name: 'Add account', exact: true }).click()
      await accounts.getByRole('button', { name: 'Watch a Safe', exact: true }).click()
      await accounts.getByRole('textbox', { name: 'Safe address' }).fill(safeSeed.safe)
      await accounts.getByRole('button', { name: 'Newframe Local Anvil', exact: true }).click()
      await accounts.getByRole('button', { name: 'Import Safe networks' }).click()
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
      )
        runtime.fail('Safe configuration differs from deployed contract')
      await runtime.screenshot(tray, '08b-safe-import.png')
      await accounts.getByRole('button', { name: 'Close accounts', exact: true }).click()
      await driver.waitForSelectedAccount({ id, address: id })
      await tray.getByRole('button', { name: /^(Requests|\d+ pending requests)$/ }).click()
      await tray.getByRole('button', { name: 'Refresh requests' }).click()
      await driver.waitForState(
        (state) =>
          (state.main?.accounts?.[id]?.safe?.[chain]?.refreshedAt || 0) > (deployment.refreshedAt || 0),
        15_000,
        'Safe refresh did not complete'
      )
      if (!deployment.pending?.some((proposal) => proposal.integrity?.status === 'matched'))
        runtime.fail('No locally matched Safe hashes')
      if (!deployment.pending?.some((proposal) => proposal.localDecoded?.method === 'transfer'))
        runtime.fail('Safe calldata was not locally decoded')
      await runtime.screenshot(tray, '08c-safe-queue.png')
      const hash = deployment.pending![1].safeTxHash
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
          return headers.length === 1 && !!bounds && bounds.top >= 0 && bounds.bottom <= innerHeight
        })
        if (!headerVisible) runtime.fail('Request review must keep its only header visible after scrolling')
        await runtime.screenshot(tray, filename)
      }
      if ((await details.locator('header').count()) !== 1) runtime.fail('Request review must have one header')
      await details.getByText('Simulation not available for Safe proposals yet.', { exact: true }).waitFor()
      for (const label of [
        'Network',
        'Safe',
        'Nonce',
        'Safe version',
        'Approval threshold',
        'Owner',
        'To',
        'Native value',
        'Operation',
        'Safe transaction hash',
        'Confirmations collected',
        'Confirmed by'
      ])
        await details.getByText(label, { exact: true }).first().waitFor()
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
      if (!hashFits) runtime.fail('Safe transaction hash extends outside proposal details')
      runtime.evidence('safeHashFits', hashFits)
      await details.getByText('Call', { exact: true }).waitFor()
      await details.getByRole('button', { name: /Show full calldata/ }).click()
      await details.getByText('Full calldata', { exact: true }).waitFor()
      await details.getByText('0x', { exact: true }).waitFor()
      if (
        await details.getByRole('button', { name: /^(Sign|Approve|Execute|Reject|Replace|Submit)$/i }).count()
      )
        runtime.fail('Safe proposal exposes signing controls')
      await captureReview('08d-safe-proposal.png')
      runtime.evidence('safeAddress', safeSeed.safe)
      runtime.evidence('safeVersion', safeSeed.version)
      runtime.evidence('safePendingCount', deployment.pending!.length)
      runtime.evidence('safeReadOnly', true)
      await details.getByRole('button', { name: 'Back to requests' }).click()
      const delegate = deployment.pending!.find((proposal) => proposal.operation === 1)
      if (!delegate) return runtime.fail('Seed has no delegate proposal')
      await tray
        .getByRole('button', { name: `Open Safe proposal ${delegate.safeTxHash} on chain ${chain}` })
        .click()
      await details.getByText('Delegatecall', { exact: true }).waitFor()
      await details.getByText('Simulation not available for Safe proposals yet.', { exact: true }).waitFor()
      await details.getByText('Waiting for earlier transactions', { exact: true }).waitFor()
      await details.getByRole('button', { name: /Show full calldata/ }).click()
      await details.getByText(delegate.data, { exact: true }).waitFor()
      if (
        (await details.getByText('Decoded method', { exact: true }).count()) ||
        (await details.getByLabel('Transaction effects', { exact: true }).count())
      )
        runtime.fail('Unknown delegate proposal fabricates decoded or simulated effects')
      if (
        await details.getByRole('button', { name: /^(Sign|Approve|Execute|Reject|Replace|Submit)$/i }).count()
      )
        runtime.fail('Delegate proposal exposes signing controls')
      await captureReview('08e-safe-delegate-raw.png')
      runtime.evidence('safeDelegateRaw', delegate.data)
      await details.getByRole('button', { name: 'Back to requests' }).click()
      const mismatch = deployment.pending!.find((proposal) => proposal.integrity?.status === 'mismatch')
      if (!mismatch) return runtime.fail('Seed has no integrity mismatch')
      await tray
        .getByRole('button', { name: `Open Safe proposal ${mismatch.safeTxHash} on chain ${chain}` })
        .click()
      await details.getByRole('alert', { name: 'Proposal integrity' }).waitFor()
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
      await accounts.getByRole('button', { name: 'Safe Account account actions', exact: true }).click()
      await accounts.getByRole('button', { name: 'Remove account', exact: true }).click()
      await accounts.getByRole('button', { name: 'Confirm remove', exact: true }).click()
      await driver.waitForState(
        (state) => !state.main?.accounts?.[id],
        5000,
        'Safe removal did not remove account'
      )
      await accounts.getByRole('button', { name: 'Close accounts', exact: true }).click()
      runtime.evidence('safeRemoved', true)
    } finally {
      if ((await driver.getAppState()).main?.accounts?.[id])
        await driver.executeCommand(tray, { type: 'account.remove', address: id })
      if (selected) await driver.setSelectedAccount(selected)
    }
  }
}
