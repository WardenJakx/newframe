import { Interface, JsonRpcProvider } from 'ethers'

import { anvilChainId, anvilRpcUrl } from '../../core/config.ts'
import { requireAccounts } from '../../visual/stages/helpers.ts'
import { sendRecipient, sendValueWei, usdcAddress, usdcAllowance, usdcSpender } from '../dapp.ts'
import type { ExtensionStage } from '../types.ts'
import { dappResult } from './helpers.ts'

const erc20 = new Interface(['function allowance(address owner, address spender) view returns (uint256)'])

export const dappTransactionsStage: ExtensionStage = {
  name: 'dapp sends transactions',
  async run(context) {
    const { driver, extension, runtime, tray } = context
    const { dapp } = extension
    const { harness } = await requireAccounts(context)
    const anvil = new JsonRpcProvider(anvilRpcUrl, anvilChainId, { staticNetwork: true })
    const requestIds = new Set<string>()

    /** Sends the dapp's transaction through the tray and returns it as mined on Anvil. */
    const submit = async (button: string, name: string) => {
      await dapp.getByRole('button', { name: button }).click()
      const request = await driver.waitForCurrentRequest('transaction', requestIds, 30_000)
      requestIds.add(request.requestId)
      const screenshot = `ext-06-tray-${button.toLowerCase().replaceAll(' ', '-')}`
      await runtime.screenshot(tray, `${screenshot}-review.png`)
      await driver.signCurrentTransaction(request, `${screenshot}-submitted.png`, [
        `${screenshot}-warning.png`,
        `${screenshot}-post-sign-warning.png`
      ])

      const hash = await dappResult(dapp)
      runtime.evidence(`${name}RequestId`, request.requestId)
      runtime.evidence(`${name}TransactionHash`, hash)
      const receipt = await anvil.waitForTransaction(hash, 1, 30_000)
      const transaction = await anvil.getTransaction(hash)
      if (receipt?.status !== 1 || !transaction) {
        return runtime.fail(`${button} transaction ${hash} did not succeed on Anvil`)
      }
      if (transaction.from.toLowerCase() !== harness.address) {
        runtime.fail(`${button} was sent by ${transaction.from}, expected ${harness.address}`)
      }
      return transaction
    }

    try {
      const send = await submit('Send ETH', 'sendEth')
      if (send.to?.toLowerCase() !== sendRecipient.toLowerCase() || send.value !== sendValueWei) {
        runtime.fail(
          `Send ETH sent ${send.value} wei to ${send.to}, expected ${sendValueWei} to ${sendRecipient}`
        )
      }

      await submit('Approve USDC', 'approveUsdc')
      const allowance = BigInt(
        await anvil.call({
          to: usdcAddress,
          data: erc20.encodeFunctionData('allowance', [harness.address, usdcSpender])
        })
      )
      if (allowance !== usdcAllowance) {
        runtime.fail(`USDC allowance for ${usdcSpender} is ${allowance}, expected ${usdcAllowance}`)
      }
      runtime.evidence('usdcAllowance', allowance.toString())
      await runtime.screenshot(dapp, 'ext-06-dapp-usdc-approved.png')
    } finally {
      anvil.destroy()
    }
  }
}
