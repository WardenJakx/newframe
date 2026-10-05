import { verifyMessage, verifyTypedData } from 'ethers'

import { requireAccounts } from '../../visual/stages/helpers.ts'
import { signedMessage, typedData } from '../dapp.ts'
import type { ExtensionStage } from '../types.ts'
import { dappResult } from './helpers.ts'

export const dappSignsStage: ExtensionStage = {
  name: 'dapp signs',
  async run(context) {
    const { driver, extension, runtime, tray } = context
    const { dapp } = extension
    const { harness, vitalik } = await requireAccounts(context)

    // The desktop app still selects vitalik.eth from `desktopSelectsUnsharedAccountStage`.
    const selected = (await driver.getAppState()).main?.currentAccount
    if (selected !== vitalik.id) {
      runtime.fail(`The desktop app selects ${selected ?? 'nothing'}, expected ${vitalik.id}`)
    }

    const signatures = [
      {
        button: 'Sign message',
        type: 'sign',
        screenshot: 'ext-05-tray-sign-message',
        signer: (signature: string) => verifyMessage(signedMessage, signature)
      },
      {
        button: 'Sign typed data',
        type: 'signTypedData',
        screenshot: 'ext-05-tray-sign-typed-data',
        signer: (signature: string) =>
          verifyTypedData(typedData.domain, typedData.types, typedData.message, signature)
      }
    ]
    for (const { button, type, screenshot, signer } of signatures) {
      await dapp.getByRole('button', { name: button }).click()
      const request = await driver.waitForCurrentRequest(type, new Set(), 30_000)
      if (request.accountId !== harness.id) {
        runtime.fail(`${button} asked ${request.accountId} to sign, expected the extension's ${harness.id}`)
      }
      // The desktop app prompts for the account the extension acts as, so it selects that account first.
      await driver.waitForSelectedAccount(harness)
      await runtime.screenshot(tray, `${screenshot}.png`)
      await driver.signCurrentSignature(request, `${screenshot}-signed.png`)

      const signature = await dappResult(dapp)
      const requests = (await driver.getAppState()).main?.accounts?.[harness.id]?.requests ?? {}
      const repeated = Object.values(requests).filter((candidate) => candidate.type === type).length
      if (repeated > 0) {
        runtime.fail(
          `${button} left ${repeated} more ${type} prompts; the extension relayed it more than once`
        )
      }
      const recovered = signer(signature).toLowerCase()
      if (recovered !== harness.address) {
        runtime.fail(`${button} returned a signature by ${recovered}, expected ${harness.address}`)
      }
      runtime.evidence(`${type}RequestId`, request.requestId)
      runtime.evidence(`${type}Signature`, signature)
    }
  }
}
