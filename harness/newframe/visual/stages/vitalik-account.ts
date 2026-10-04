import type { VisualStage } from '../types.ts'

const vitalikAddress = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'

export const vitalikAccountStage: VisualStage = {
  name: 'ensure vitalik.eth watch account',
  async run({ driver }) {
    const hasVitalik = (state: Awaited<ReturnType<typeof driver.getAppState>>) =>
      Object.values(state.main?.accounts ?? {}).some((account) =>
        [account.ensName, account.name].some((value) => String(value ?? '').toLowerCase() === 'vitalik.eth')
      )
    if (hasVitalik(await driver.getAppState())) {
      return
    }

    // A seeded profile has no accounts; name it directly so the stage needs no mainnet ENS lookup.
    const operationId = crypto.randomUUID()
    await driver.executeCommand(driver.tray, {
      type: 'account.create',
      operationId,
      source: 'watch',
      addressOrName: vitalikAddress,
      name: 'vitalik.eth'
    })
    const state = await driver.waitForState(
      (candidate) => {
        const status = candidate.operations?.[operationId]?.operation?.status
        return status === 'failed' || (status === 'succeeded' && hasVitalik(candidate))
      },
      15_000,
      'vitalik.eth watch account creation did not complete'
    )
    const operation = state.operations?.[operationId]?.operation
    if (operation?.status === 'failed') {
      driver.fail(operation.error?.message ?? 'vitalik.eth watch account creation failed')
    }
  }
}
