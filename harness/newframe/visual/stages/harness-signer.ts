import { harnessAccountAddress, harnessAccountPrivateKey, readHarnessPassword } from '../../core/config.ts'
import type { VisualStage } from '../types.ts'

export const harnessSignerStage: VisualStage = {
  name: 'ensure local harness signer',
  async run({ driver }) {
    const hasSigner = (state: Awaited<ReturnType<typeof driver.getAppState>>) => {
      const signerId = state.main?.accounts?.[harnessAccountAddress]?.signer
      return Boolean(signerId && state.main?.signers?.[signerId])
    }
    if (hasSigner(await driver.getAppState())) {
      return
    }

    const operationId = crypto.randomUUID()
    await driver.executeCommand(driver.tray, {
      type: 'signer.import',
      operationId,
      source: 'private-key',
      privateKey: harnessAccountPrivateKey,
      framePassword: readHarnessPassword(),
      accountName: 'Harness Account'
    })
    const state = await driver.waitForState(
      (candidate) => {
        const status = candidate.operations?.[operationId]?.operation?.status
        return status === 'failed' || (status === 'succeeded' && hasSigner(candidate))
      },
      15_000,
      'Local harness signer import did not complete'
    )
    const operation = state.operations?.[operationId]?.operation
    if (operation?.status === 'failed') {
      driver.fail(operation.error?.message ?? 'Local harness signer import failed')
    }
  }
}
