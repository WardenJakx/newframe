import { isDeepStrictEqual } from 'node:util'

import {
  Contract,
  FetchRequest,
  JsonRpcProvider,
  formatUnits,
  getBytes,
  hashMessage,
  hexlify,
  toUtf8Bytes
} from 'ethers'

import { anvilChainId, anvilRpcUrl, newframeRpcUrl } from '../../core/config.ts'
import { harnessOrigin } from '../driver.ts'
import type { VisualStage } from '../types.ts'

const EIP1271_MAGIC_VALUE = '0x1626ba7e'
const EIP1271_SIGNATURE = 'function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)'

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
      if (await details.getByRole('button', { name: /Show full calldata/ }).count()) {
        runtime.fail('Empty Safe calldata must not expose a calldata toggle')
      }
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

      const rpcRequest = new FetchRequest(`${newframeRpcUrl}?chainId=${anvilChainId}`)
      rpcRequest.setHeader('Origin', `http://${harnessOrigin}`)
      const dappProvider = new JsonRpcProvider(rpcRequest, anvilChainId, {
        batchMaxCount: 1,
        pollingInterval: 250,
        staticNetwork: true
      })
      const chainProvider = new JsonRpcProvider(anvilRpcUrl, anvilChainId, {
        batchMaxCount: 1,
        staticNetwork: true
      })
      try {
        const accessPromise = dappProvider.send('eth_requestAccounts', [])
        void accessPromise.catch(() => undefined)
        const accessRequest = await driver.waitForCurrentRequest('access', new Set(), 15_000)
        if (accessRequest.accountId.toLowerCase() !== id) {
          runtime.fail('Safe dapp access request was attached to a different account')
        }
        await driver.approveAccessRequest(accessRequest)
        await accessPromise

        const message = hexlify(toUtf8Bytes('Newframe Safe EIP-1271 acceptance'))
        const signaturePromise = dappProvider.send('personal_sign', [message, safeSeed.safe])
        void signaturePromise.catch(() => undefined)
        const signingRequest = await driver.waitForCurrentRequest('sign', new Set(), 15_000)
        if (signingRequest.accountId.toLowerCase() !== id) {
          runtime.fail('Safe message request was attached to a different account')
        }
        await tray.getByText('Safe account', { exact: true }).waitFor()
        const ownerSelector = tray.getByRole('button', { name: 'Owner signer' })
        await ownerSelector.waitFor()
        if ((await ownerSelector.textContent())?.includes('Choose an owner')) {
          runtime.fail('Safe message request did not auto-select its sole eligible owner')
        }
        await tray.getByText(`0 / ${safeSeed.threshold} verified confirmations`, { exact: true }).waitFor()
        await runtime.screenshot(tray, '08g-safe-message-request.png')
        await tray.getByRole('button', { name: 'Sign as owner', exact: true }).click()
        const signature: unknown = await signaturePromise
        if (typeof signature !== 'string' || !/^0x[0-9a-f]+$/i.test(signature)) {
          runtime.fail('Safe personal_sign returned an invalid aggregate signature')
        }
        const safe = new Contract(safeSeed.safe, [EIP1271_SIGNATURE], chainProvider)
        const validity: unknown = await safe.isValidSignature(hashMessage(getBytes(message)), signature)
        if (typeof validity !== 'string' || validity !== EIP1271_MAGIC_VALUE) {
          runtime.fail(`Safe EIP-1271 validation returned ${String(validity)}`)
        }
        runtime.evidence('safeMessageOwnerApproved', safeSeed.owners[0])
        runtime.evidence('safeMessageEip1271', EIP1271_MAGIC_VALUE)

        const sendState = { settled: false }
        const transactionHashPromise = dappProvider
          .send('eth_sendTransaction', [
            {
              from: safeSeed.safe,
              to: safeSeed.owners[1],
              value: '0x0',
              data: '0x'
            }
          ])
          .finally(() => {
            sendState.settled = true
          })
        void transactionHashPromise.catch(() => undefined)
        const transactionRequest = await driver.waitForCurrentRequest('transaction', new Set(), 15_000)
        if (transactionRequest.accountId.toLowerCase() !== id) {
          runtime.fail('Safe transaction request was attached to a different account')
        }
        const requestSafeTxHash = transactionRequest.safeTxHash
        if (typeof requestSafeTxHash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(requestSafeTxHash)) {
          return runtime.fail('Safe transaction request did not expose its canonical SafeTx hash')
        }
        const transactionReview = tray
        await transactionReview.getByText('Safe owner approval', { exact: true }).waitFor()
        await transactionReview.getByText('Safe Account', { exact: true }).first().waitFor()
        await transactionReview.getByRole('button', { name: 'Sign', exact: true }).click()
        await transactionReview.getByText('Ready · awaiting execution', { exact: true }).waitFor({
          timeout: 15_000
        })
        if (sendState.settled) {
          return runtime.fail(
            'Safe eth_sendTransaction completed after owner approval without explicit execution'
          )
        }
        await transactionReview.getByText('Gas-paying executor', { exact: true }).first().waitFor()
        const executionState = await driver
          .waitForState(
            (state) => {
              const execution = state.main?.accounts?.[id]?.safe?.[chain]?.pending?.find(
                (candidate) => candidate.safeTxHash === requestSafeTxHash
              )?.local?.execution
              return execution?.status === 'ready' || execution?.status === 'failed'
            },
            15_000,
            'Safe executor preparation did not finish'
          )
          .catch(async () => {
            const state = await driver.getAppState()
            const execution = state.main?.accounts?.[id]?.safe?.[chain]?.pending?.find(
              (candidate) => candidate.safeTxHash === requestSafeTxHash
            )?.local?.execution
            return runtime.fail(`Safe executor preparation stalled: ${JSON.stringify(execution ?? null)}`)
          })
        const execution = executionState.main?.accounts?.[id]?.safe?.[chain]?.pending?.find(
          (candidate) => candidate.safeTxHash === requestSafeTxHash
        )?.local?.execution
        if (execution?.status !== 'ready') {
          runtime.fail(`Safe executor preparation failed: ${JSON.stringify(execution ?? null)}`)
        }
        runtime.evidence('safePreparedExecutor', execution?.executorId ?? null)
        await transactionReview.getByRole('button', { name: 'Execution details', exact: true }).click()
        await transactionReview.getByRole('region', { name: 'Reviewed executor transaction' }).waitFor()
        await transactionReview
          .getByRole('button', { name: 'Execute transaction', exact: true })
          .waitFor({ timeout: 15_000 })
        await runtime.screenshot(tray, '08h-safe-dapp-execution-review.png')
        await transactionReview.getByRole('button', { name: 'Execute transaction', exact: true }).click()
        const outerTxHash: unknown = await transactionHashPromise
        if (
          typeof outerTxHash !== 'string' ||
          !/^0x[0-9a-f]{64}$/i.test(outerTxHash) ||
          outerTxHash.toLowerCase() === requestSafeTxHash.toLowerCase()
        ) {
          return runtime.fail(
            `Safe eth_sendTransaction returned an invalid outer hash: ${String(outerTxHash)}`
          )
        }
        const receipt = await chainProvider.waitForTransaction(outerTxHash, 1, 15_000)
        const outerTransaction = await chainProvider.getTransaction(outerTxHash)
        if (
          receipt?.status !== 1 ||
          receipt.hash.toLowerCase() !== outerTxHash.toLowerCase() ||
          outerTransaction?.to?.toLowerCase() !== id ||
          outerTransaction.from.toLowerCase() !== safeSeed.owners[0].toLowerCase()
        ) {
          runtime.fail('Safe execution was not broadcast as the reviewed outer EOA transaction')
        }
        await driver.waitForState(
          (state) =>
            state.main?.accounts?.[id]?.safe?.[chain]?.pending?.some(
              (candidate) =>
                candidate.safeTxHash.toLowerCase() === requestSafeTxHash.toLowerCase() &&
                candidate.local?.execution.transactionHash?.toLowerCase() === outerTxHash.toLowerCase()
            ) === true,
          15_000,
          'Safe proposal did not retain the submitted outer transaction hash'
        )
        const executedSafe = new Contract(
          safeSeed.safe,
          ['function nonce() view returns (uint256)'],
          chainProvider
        )
        if ((await executedSafe.nonce()) !== 1n) {
          runtime.fail('Safe execution did not advance the onchain Safe nonce')
        }
        runtime.evidence('safeDappSafeTxHash', requestSafeTxHash)
        runtime.evidence('safeDappOuterTxHash', outerTxHash)
        runtime.evidence('safeDappSeparateExecution', true)
      } finally {
        dappProvider.destroy()
        chainProvider.destroy()
      }

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
